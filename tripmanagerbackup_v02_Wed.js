const express = require('express');
const mysql = require('mysql');
const request = require('then-request');
const config = require('./config.js');
const airbusApiConfig = require('./airbusapiconfig.js'); // remove this one if needed
const wowboxApiConfig = require('./wowboxconfig');
const util = require('./utilities.js');
const bodyParser = require('body-parser');
const { response } = require('express');
const { getDefaultFlags } = require('mysql/lib/ConnectionConfig');

var app = express();
var router = express.Router();

var retryTimer;
var rejectionRetryTimer;

// Pooled connection impl. from meshmanager
var tripConnectionOptions = {
    connectionLimit: 10,
    host: config.sql.host,
    socketPath: config.sql.socket, // was commented out
    user: config.sql.user,
    password: config.sql.password,
    multipleStatements: true,
    database: config.sql.databases.trips.name
};

// Clone the options object
var connectionPoolOptions = JSON.parse(JSON.stringify(tripConnectionOptions));
connectionPoolOptions.database = config.sql.databases.trips.name;
var airportConnectionPoolOptions = JSON.parse(JSON.stringify(tripConnectionOptions));
airportConnectionPoolOptions.database = config.sql.databases.airportData.name;

var initialConnection = mysql.createConnection(tripConnectionOptions);
var connectionPool = mysql.createPool(connectionPoolOptions);
var airportConnectionPool = mysql.createPool(airportConnectionPoolOptions);

// Helper method to close the connection, and handle no connection or connection already closed
var closeConnection = (conn, showError = false) => {
    if (conn) {
        try {
            conn.release();
            conn = undefined;
        } catch (e) {
            if (showError) {
                console.log(e);
            }
        }
    }
}

var airbusGetRequest = (endpoint) => {
    // Serialised request by design
    console.log(`GET REQUEST: ${airbusApiConfig.getURL() + endpoint}`);
    var res = request('GET', airbusApiConfig.getURL() + endpoint, {
        timeout: 10000
    });
    console.log(res.getBody('utf8') || 'RESPONSE EMPTY');

    return res.getBody('utf8') || {};
};


// GET REQUEST FROM WOWBOXAPI /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
var wowboxGetRequest = (endpoint) => {
    console.log(`GET REQUEST: ${wowboxApiConfig.getURL() + endpoint}`);
    request( 'GET', wowboxApiConfig.getURL() + endpoint)   
        .done((res) => console.log(JSON.parse(res.getBody().toString())))
};
// GET REQUEST FROM WOWBOXAPI /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var getTail = (callback) => callback(airbusGetRequest(airbusApiConfig.endpoint.tail).replace(/['"]+/g, ''));

var getIatas = (callback) => callback(airbusGetRequest(airbusApiConfig.endpoint.cityPair).replace(/['"]+/g, '').split('-'));

// GET REQUEST FROM WOWBOXAPI /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
var getFlightData = () => wowboxGetRequest(wowboxApiConfig.endpoint.flightInfo);
// var getFlightData = () => wowboxGetRequest(wowboxApiConfig.endpoint.flightInfo);


// GET REQUEST FROM WOWBOXAPI /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var tail;
var tripId;
var iatas;
var stopId;
var flightDetails = {};

var shouldCheckTail = true;
var shouldCheckTrip = true;
var shouldCheckIatas = true;

var retryCount = 0;

var resetTrackers = () => {
    shouldCheckTail = true;
    shouldCheckTrip = true;
    shouldCheckIatas = true;
};

var connection;
var airportConnection;

var sqlSteps = {
    checkOverride: (skip = false) => new Promise((res, rej) => {
        if (skip) {
            return rej('Skipping checkOverride')
        }
        connection.query(
            util.logAndUse(`SELECT * FROM \`bb_extensions\` WHERE \`name\` = 'com_jtrip_manager' AND \`params\` LIKE '%"override":"1"%'`),
            (err, result) => {
                if (err) {
                    return rej(err);
                }
                if (result && result.length > 0) {
                    // Override is active
                    return res(1);
                } else {
                    return res(0);
                }
            });
    }),
    resetOverride: (skip = false) => new Promise((res, rej) => {
        if (skip) {
            return rej('Skipping resetOverride');
        }
        connection.query(
            util.logAndUse(`SELECT \`params\` FROM \`bb_extensions\` where \`name\` = 'com_jtrip_manager'`),
            (err, result) => {
                if (err) {
                    return rej(err);
                }
                if (result && result.length > 0) {
                    console.log(result[0].params);
                    var paramsJson = JSON.parse(result[0].params);
                    if (paramsJson.override === "1") {
                        paramsJson.override = "0"; //UPDATE params with paramsJson;
                        connection.query(
                            util.logAndUse(`UPDATE \`bb_extensions\` SET params='${JSON.stringify(paramsJson)}' WHERE \`name\` = 'com_jtrip_manager';`),
                            (err, result) => {
                                if (err) {
                                    return rej(err);
                                } else {
                                    return res('Override reset');
                                }
                            }
                        );
                    } else {
                        return res('Override not set, skipping');
                    }
                } else {
                    return res('com_jtrip_manager not found. Skipping.')
                }
            });
    }),
    selectTrip: (skip = false) => new Promise((res, rej) => {
        if (skip) {
            return rej('Skipping selectTrip');
        }
        // console.log(connection);
        connection.query(
            config.simulated ?
            util.logAndUse(`SELECT id FROM ${config.sql.databases.trips.tables.trip} WHERE REPLACE(REPLACE(tail, '-', ''), ' ', '') = REPLACE(REPLACE('${tail}', '-', ''), ' ', '') AND date_from > (NOW() - INTERVAL ${config.sql.fuzzyTimeWindowInHours} HOUR) AND date_to > (NOW() - INTERVAL ${config.sql.fuzzyTimeWindowInHours} HOUR);`) :
            util.logAndUse(`SELECT id FROM ${config.sql.databases.trips.tables.trip} WHERE REPLACE(REPLACE(tail, '-', ''), ' ', '') = REPLACE(REPLACE('${tail}', '-', ''), ' ', '') AND date_from < (NOW() + INTERVAL ${config.sql.fuzzyTimeWindowInHours} HOUR) AND date_to > (NOW() - INTERVAL ${config.sql.fuzzyTimeWindowInHours} HOUR);`),
            (err, result) => {
                if (err) {
                    return rej(err);
                }
                if (result && result.length > 0) {
                    if (result.length > 1) {
                        console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
                        console.log('IMPORTANT: tripId has more than one result!');
                        console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
                        console.log('Selecting first element');
                    }
                    tripId = result[0].id;

                    return res();
                } else {
                    return rej(0);
                }
            });
    }),
    setAllTripsInactive: (skip = false) => new Promise((res, rej) => {
        if (skip) {
            return rej('Skipping setAllTripsInactive');
        }
        connection.query(
            util.logAndUse(`UPDATE ${config.sql.databases.trips.tables.trip} SET active = 0 WHERE active = 1;`),
            (err, result) => {
                if (err) {
                    return rej(err);
                }
                if (result) {
                    return res();
                } else {
                    return rej(0);
                }
            });
    }),
    setTripActive: (skip = false) => new Promise((res, rej) => {
        if (skip) {
            return rej('Skipping setTripActive');
        }
        connection.query(
            util.logAndUse(`UPDATE ${config.sql.databases.trips.tables.trip} SET active = 1 WHERE id = ${tripId}`),
            (err, result) => {
                if (err) {
                    return rej(err);
                }
                if (result) {
                    shouldCheckTrip = false;
                    console.log('Trip set to active');

                    return res();
                } else {
                    return rej(0);
                }
            });
    }),
    selectStop: {
        standard: (skip = false) => new Promise((res, rej) => {
            if (skip) {
                return rej('Skipping selectStop.standard');
            }
            connection.query(
                util.logAndUse(`SELECT stop_id FROM ${config.sql.databases.trips.tables.stoppair} WHERE trip_id = '${tripId}' AND (origin_iata = '${iatas[0]}' OR alt_origin_iata = '${iatas[0]}') AND (destination_iata = '${iatas[1]}' OR alt_destination_iata = '${iatas[1]}')`),
                (err, result) => {
                    if (err) {
                        return rej(err);
                    }
                    if (result && result.length > 0) {
                        if (result.length > 1) {
                            result.forEach(element => {
                                console.log(element);
                            });
                            console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
                            console.log('IMPORTANT: stopId has more than one result!');
                            console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');

                            return res(result);
                        }
                        stopId = result[0].stop_id;

                        return res(0);
                    } else {
                        return rej(0);
                    }
                });
        }),
        inactive: (skip = false) => new Promise((res, rej) => {
            if (skip) {
                return rej('Skipping selectStop.inactive');
            }
            connection.query(
                util.logAndUse(`SELECT stop_id FROM ${config.sql.databases.trips.tables.stoppair} WHERE trip_id = '${tripId}' AND status = 0 AND (origin_iata = '${iatas[0]}' OR alt_origin_iata = '${iatas[0]}') AND (destination_iata = '${iatas[1]}' OR alt_destination_iata = '${iatas[1]}')`),
                (err, result) => {
                    if (err) {
                        return rej(err);
                    }
                    if (result && result.length > 0) {
                        if (result.length > 1) {
                            result.forEach(element => {
                                console.log(element);
                            });
                            console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
                            console.log('IMPORTANT: stopId has more than one result!');
                            console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');

                            return res(result);
                        }
                        stopId = result[0].stop_id;

                        return res(0);
                    } else {
                        return rej(0);
                    }
                });
        }),
        withDate: (skip = false) => new Promise((res, rej) => {
            if (skip) {
                return rej('Skipping selectStop.withDate');
            }
            connection.query(
                util.logAndUse(`SELECT stop_id FROM ${config.sql.databases.trips.tables.stoppair} WHERE trip_id = '${tripId}' AND arrival_date > (NOW() - INTERVAL ${config.sql.fuzzyTimeWindowInHours} HOUR) AND departure_date < (NOW() + INTERVAL ${config.sql.fuzzyTimeWindowInHours} HOUR) AND (origin_iata = '${iatas[0]}' OR alt_origin_iata = '${iatas[0]}') AND (destination_iata = '${iatas[1]}' OR alt_destination_iata = '${iatas[1]}')`),
                (err, result) => {
                    if (err) {
                        return rej(err);
                    }
                    if (result && result.length > 0) {
                        if (result.length > 1) {
                            result.forEach(element => {
                                console.log(element);
                            });
                            console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
                            console.log('IMPORTANT: stopId has more than one result!');
                            console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');

                            return res(result);
                        }
                        stopId = result[0].stop_id;

                        return res(0);
                    } else {
                        return rej(0);
                    }
                });
        }),
        withDateInactive: (skip = false) => new Promise((res, rej) => {
            if (skip) {
                return rej('Skipping selectStop.withDateInactive');
            }
            connection.query(
                util.logAndUse(`SELECT stop_id FROM ${config.sql.databases.trips.tables.stoppair} WHERE trip_id = '${tripId}' AND status = 0 AND arrival_date > (NOW() - INTERVAL ${config.sql.fuzzyTimeWindowInHours} HOUR) AND departure_date < (NOW() + INTERVAL ${config.sql.fuzzyTimeWindowInHours} HOUR) AND (origin_iata = '${iatas[0]}' OR alt_origin_iata = '${iatas[0]}') AND (destination_iata = '${iatas[1]}' OR alt_destination_iata = '${iatas[1]}')`),
                (err, result) => {
                    if (err) {
                        return rej(err);
                    }
                    if (result && result.length > 0) {
                        if (result.length > 1) {
                            result.forEach(element => {
                                console.log(element);
                            });
                            console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
                            console.log('IMPORTANT: stopId has more than one result!');
                            console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');

                            return res(result);
                        }
                        stopId = result[0].stop_id;

                        return res(0);
                    } else {
                        return rej(0);
                    }
                });
        })
    },
    setAllStopsInactiveForTrip: (skip = false) => new Promise((res, rej) => {
        if (skip) {
            return rej('Skipping setAllStopsInactiveForTrip');
        }
        if (!tripId) {
            return rej('No tripID');
        }
        connection.query(
            util.logAndUse(`UPDATE ${config.sql.databases.trips.tables.stop} SET status = 1 WHERE status = 2 AND trip_id = '${tripId}';`),
            (err, result) => {
                if (err) {
                    return rej(err);
                }
                if (result) {
                    return res();
                } else {
                    return rej(0);
                }
            });
    }),
    setStopActive: (skip = false) => new Promise((res, rej) => {
        if (skip) {
            return rej('Skipping setStopActive');
        }
        connection.query(
            util.logAndUse(`UPDATE ${config.sql.databases.trips.tables.stop} SET status = 2 WHERE id = ${stopId} AND trip_id = '${tripId}';`),
            (err, result) => {
                if (err) {
                    return rej(err);
                }
                if (result) {
                    console.log('Stop active');

                    return res();
                } else {
                    return rej(0);
                }
            });
    }),
    getIATAFromIdent: (iataArray, skip = false) => new Promise((res, rej) => {
        if (skip) {
            return rej('Skipping getIATAFromIdent');
        }
        airportConnection.query(
            util.logAndUse(`SELECT ident, iata_code FROM ${config.sql.databases.airportData.tables.airports} WHERE ident = '${iataArray[0]}' OR ident = '${iataArray[1]}';`),
            (err, result) => {
                if (err) {
                    return rej(err);
                }
                if (result && result.length >= 2) {
                    if (result[0].ident == iataArray[0]) {
                        iataArray[0] = result[0].iata_code;
                        iataArray[1] = result[1].iata_code;
                    } else {
                        iataArray[1] = result[0].iata_code;
                        iataArray[0] = result[1].iata_code;
                    }

                    return res(iataArray);
                } else {
                    return rej(0);
                }
            });
    })
};

var mainLoop = () => {

    var deactivateStopsWithCallback = (callback) => {
        if (connection) {
            connection.release();
            connection = undefined;
        }
        connectionPool.getConnection((err, conn) => {
            if (err) {
                if (conn) {
                    conn.release();
                }
                throw err;
            };
            connection = conn;
            sqlSteps.setAllStopsInactiveForTrip().then((result) => {
                console.log("All stops inactive");
                callback();
            }).catch((err) => {
                console.log("Error settings stops inactive");
                console.log(err);
                callback();
            });
        });

    }

    var rejectionCatch = (err) => {
        // Set all stops inactive

        deactivateStopsWithCallback(() => {
            closeConnection(connection);
            if (err === 0) {
                console.log(`NoResultErr: Skipping further processing and triggering retry ${retryCount + 1}`);
            } else {
                console.log(err);
            }

            if (retryTimer) {
                clearTimeout(retryTimer);
                retryTimer = undefined;
            }
            if (rejectionRetryTimer) {
                clearTimeout(rejectionRetryTimer);
                rejectionRetryTimer = undefined;
            }
            rejectionRetryTimer = setTimeout(() => {
                runMainLoop();
                rejectionRetryTimer = undefined;
            }, 10000);
        });

    };

    var stopSelected = () => {

        var errorFlag = false;

        [sqlSteps.setAllStopsInactiveForTrip, sqlSteps.setStopActive].reduce((promiseChain, currentTask) => {
            return promiseChain.then(
                chainResults => currentTask(errorFlag).then(
                    currentResult => [...chainResults, currentResult]
                ).catch((err) => {
                    errorFlag = true;
                    rejectionCatch(err);
                })
            );
        }, Promise.resolve([])).then((_resultsArray) => {
            closeConnection(connection);
            retryCount = 0;
            resetTrackers();
            if (retryTimer) {
                clearTimeout(retryTimer);
                retryTimer = undefined;
            }
            if (!rejectionRetryTimer) {
                retryTimer = setTimeout(() => {
                    runMainLoop();
                }, config.simulated ? 10000 : 120000);
            }
        });
    };

    // MAINLOOP START

    console.log('Running main loop');

    if (++retryCount >= config.maxRetryCount) {
        console.log('Hit max retry count, sleeping and resetting trackers.');
        resetTrackers();
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = undefined;
        }

        if (!rejectionRetryTimer) {
            retryTimer = setTimeout(() => {
                retryCount = 0;
                runMainLoop();
            }, 30000);
        }

        return;
    }

    if (shouldCheckTail) {
        getTail((newTail) => {
            if (newTail) {
                tail = newTail;
                shouldCheckTail = false;

                return mainLoop();
            } else {
                if (retryTimer) {
                    clearTimeout(retryTimer);
                    retryTimer = undefined;
                }

                if (!rejectionRetryTimer) {
                    retryTimer = setTimeout(() => {
                        return mainLoop();
                    }, 10000);
                }
            }
        });
    } else if (shouldCheckTrip) {
        connectionPool.getConnection((err, conn) => {
            if (err) {
                if (conn) {
                    conn.release();
                }
                throw err;
            };
            connection = conn;
            var errorFlag = false;
            [sqlSteps.selectTrip, sqlSteps.setAllTripsInactive, sqlSteps.setTripActive].reduce((promiseChain, currentTask) => {
                return promiseChain.then(
                    chainResults => currentTask(errorFlag).then(
                        currentResult => [...chainResults, currentResult]
                    ).catch((err) => {
                        if (!errorFlag) {
                            if (connection) {
                                connection.release();
                                connection = undefined;
                            }
                            errorFlag = true;
                            rejectionCatch(err);
                        }
                    })

                );
            }, Promise.resolve([])).then((_resultsArray) => {
                if (connection) {
                    connection.release();
                    connection = undefined;
                }
                if (!errorFlag) {
                    mainLoop();
                }
            });

            // // Synchronous promises
            // [sqlSteps.selectTrip, sqlSteps.setAllTripsInactive, sqlSteps.setTripActive].reduce(_promise, Promise.resolve()).then(() => {
            //     console.log('ALPHA');
            //     connection.release();
            //     connection = undefined;
            //     mainLoop();
            // }).catch(rejectionCatch);
        });
    } else if (shouldCheckIatas) {
        getIatas((newIatas) => {
            if (newIatas) {
                iatas = newIatas;
                // Convert iatas to icaos

                if (iatas[0].length == 3) {
                    shouldCheckIatas = false;
                    return mainLoop();
                } else {
                    airportConnectionPool.getConnection((err, conn) => {
                        if (err) {
                            console.log(err);
                            if (conn) {
                                conn.release();
                            }
                            throw err;
                        };
                        airportConnection = conn;
                        sqlSteps.getIATAFromIdent(iatas).then((result) => {
                            iatas = result;
                            shouldCheckIatas = false;

                            if (airportConnection) {
                                airportConnection.release();
                                airportConnection = undefined;
                            }

                            return mainLoop();
                        }).catch((err) => {
                            closeConnection(airportConnection);
                            if (err === 0) {
                                console.log(`NoResultErr: Skipping further processing and triggering retry ${retryCount + 1}`);
                            } else {
                                console.log(err);
                            }

                            deactivateStopsWithCallback(() => {
                                closeConnection(connection);
                                runMainLoop();
                            })
                        });
                    });
                }


            } else {
                if (retryTimer) {
                    clearTimeout(retryTimer);
                    retryTimer = undefined;
                }

                if (!rejectionRetryTimer) {
                    retryTimer = setTimeout(() => {
                        return mainLoop();
                    }, 10000);
                }

            }

        });

    } else {

        connectionPool.getConnection((err, conn) => {
            if (err) {
                if (conn) {
                    conn.release();
                }
                throw err;
            };
            connection = conn;

            sqlSteps.selectStop.standard(true).then((result) => {
                if (result === 0) {
                    // Only one stop, continue
                    stopSelected();
                } else {
                    // result is array of results
                    var defaultedId = result[0].stop_id;

                    sqlSteps.selectStop.withDate(true).then((datedResult) => {
                        if (datedResult === 0) {
                            // One stop matched date and was selected
                            stopSelected();
                        } else if (datedResult.length > 1) {
                            // More than one stop matched with date
                            sqlSteps.selectStop.withDateInactive(true).then((datedInactiveResult) => {
                                // if 0, one result was found and selected in promise
                                if (datedInactiveResult !== 0) {
                                    if (datedInactiveResult.length > 0) {
                                        // More than one dated & inactive stop matched, selecting first
                                        stopId = datedInactiveResult[0].stop_id;
                                    } else {
                                        // No dated & inactive stops, selecting first dated
                                        stopId = datedResult[0].stop_id;
                                    }
                                }
                                stopSelected();
                            }).catch(rejectionCatch);
                        } else {
                            sqlSteps.selectStop.inactive(true).then((inactiveResult) => {
                                // if 0, one result was found and seleced in promise
                                if (inactiveResult !== 0) {
                                    if (inactiveResult.length > 0) {
                                        // More than one inactive stop found, selecting first
                                        stopId = inactiveResult[0];
                                    } else {
                                        // No inactive stops found, selecting original first element
                                        stopId = defaultedId;
                                    }
                                }
                                stopSelected();

                            }).catch(rejectionCatch);
                        }
                    });
                }
            }).catch(rejectionCatch);
        });
    }

};

var runMainLoop = () => {

    connectionPool.getConnection((err, conn) => {
        if (err) {
            if (conn) {
                conn.release();
            }
            throw err;
        };
        connection = conn;
        sqlSteps.checkOverride(true).then((result) => {
            closeConnection(connection);
            if (result === 1) {
                console.log('Skipping nTripManager tick due to active override');
                if (retryTimer) {
                    clearTimeout(retryTimer);
                    retryTimer = undefined;
                }

                if (!rejectionRetryTimer) {
                    retryTimer = setTimeout(() => {
                        retryCount = 0;
                        runMainLoop();
                    }, 60000);
                }

                return;
            } else {
                try {
                    mainLoop();
                } catch (e) {
                    console.log(e);
                    console.log('Mainloop failed. Sleeping then retrying');
                    if (retryTimer) {
                        clearTimeout(retryTimer);
                        retryTimer = undefined;
                    }

                    if (!rejectionRetryTimer) {
                        retryTimer = setTimeout(() => {
                            retryCount = 0;
                            runMainLoop();
                        }, 10000);
                    }
                }
            }
        }).catch((err) => {
            console.log(err);
            console.log('Override reset call failed. Attempting to run anyway');
            runMainLoop();
        });
    });

};

// API deprecated, dummy object
const tripManager = {
    currentTrip: {},
    api: {
        getCurrentTrip: () => {
            return 'Trip API deprecated, this module updates the database directly';
        },
        getFlightPair: (req, res) => {
            if (iatas && iatas.length == 2) {
                let flightPair = {
                    origin: iatas[0],
                    destination: iatas[1]
                };
                return res.json(flightPair);
            }

            return res.json("This is the flight pair");
        },
        getFlightInfo: (req, res) => {                   
            request( 'GET', wowboxApiConfig.getURL() + 'flightdata')   
                .done(function (result){
                    return res.json(JSON.parse(result.getBody().toString()))          
            })           
        },
        getOrigin: (req, res) => {                   
            request( 'GET', wowboxApiConfig.getURL() + 'flightdata')   
                .done(function (result){
                    return res.json(JSON.parse(result.getBody().toString()).route.origin)          
            })           
        },
        getDestination: (req, res) => {                   
            request( 'GET', wowboxApiConfig.getURL() + 'flightdata')   
                .done(function (result){
                    return res.json(JSON.parse(result.getBody().toString()).route.destination)          
            })           
        },getHex: (req, res) => {                   
            request( 'GET', wowboxApiConfig.getURL() + 'flightdata')   
                .done(function (result){
                    return res.json(JSON.parse(result.getBody().toString()).route.hexIdent)          
            })           
        },
    }
};

// API Setup
router.get('/', (req, res) => {
    return res.send('OK This is the main path');
});

router.get(config.api.endpoint.getFlightPair, (req, res) => tripManager.api.getFlightPair(req, res));

// GET REQUEST FROM WOWBOXAPI /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
router.get(config.api.endpoint.getFlightInfo, (req, res) => tripManager.api.getFlightInfo(req, res));

router.get(config.api.endpoint.getDestination, (req, res) => tripManager.api.getDestination(req, res));

router.get(config.api.endpoint.getOrigin, (req, res) => tripManager.api.getOrigin(req, res));

router.get(config.api.endpoint.getHex, (req, res) => tripManager.api.getHex(req, res));
// GET REQUEST FROM WOWBOXAPI /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(bodyParser.json());
app.use('/api', router);
// Start server
app.listen(config.api.port, function () {
    console.log('nTripManager API is now running on port ' + config.api.port);
});

var kickStarter = setInterval(() => {
    if (!rejectionRetryTimer && !retryTimer) {
        let currentTime = new Date().getTime();

        if (currentTime - util.lastLog > config.kickstartTime) {
            console.log("Kickstarter kicked, prerequisite met. Kickstarting loop.");
            retryCount = 0;
            runMainLoop();
        } else {
            console.log("Kickstarter ignored, prerequisites not met: Time since lastlog does not exceed threshold.");
        }

    } else {
        console.log("Kickstarter ignored, prerequisites not met: A timer is still active");
    }
}, 600000);

var initialise = () => {
    console.log("Running initial DB connection");
    connectionPool.getConnection((err, conn) => {
        if (err) {
            console.log(err);
            console.log("Initial DB error. Tripmanager will retry the connection shortly.");
            closeConnection(conn);
            setTimeout(() => {
                initialise();
            }, 20000);
        } else {
            connection = conn;
            sqlSteps.resetOverride(true).then((result) => {
                console.log(result);
                runMainLoop();
            }).catch((err) => {
                console.log(err);
                console.log('Override reset call failed. Attempting to run anyway');
                runMainLoop();
            });
        }
    });
};
initialise();

module.exports = tripManager;
