const express = require('express')

const util = require('util')


// console.log('LALALALALA')

// var wowboxGetRequest = () => {
//     // Serialised request by design
//     console.log(`https://api.coindesk.com/v1/bpi/currentprice.json`);
//     var res = request('GET', `https://api.coindesk.com/v1/bpi/currentprice.json`)
//         .done(function(result) {
//             console.log(result.getBody('utf8') || 'RESPONSE EMPTY');
//         });
    

//     return res
// };

// wowboxGetRequest()
    
// var testfunction = () => {
//     return new Promise(function (resolve, reject) {
//         request('GET', 'https://api.coindesk.com/v1/bpi/currentprice.json', function (error, res, body) {
//             if (!error && res.statusCode == 200) {
//                 resolve(body)
//             } else {
//                 reject(error)
//             }
//         })
//     })
// }

// async function main() {
//     let res = await testfunction()
//     console.log(res)
// }

// main()

// async function getBody(url) {
//     const options = {
//         url: url,
//         method: 'GET',
//     };

//     // Return new promise
//     return new Promise (function (resolve, reject) {
//         // Do async job 
//         request.get(options, function (err, resp, body) {
//             if (err) {
//                 reject (err)
//             } else {
//                 resolve(body)
//             }
//         })
//     })
// }

// getBody('https://api.coindesk.com/v1/bpi/currentprice.json')
// const url = 'https://api.coindesk.com/v1/bpi/currentprice.json'

// console.log(request('GET', 'https://api.coindesk.com/v1/bpi/currentprice.json', this.options, function (err, res) {
//     if (err) {
//      return callback(new Error('Request to provider failed due to connection issue or server does not responded'),
//       null);
//     }
  
//     if (res.statusCode != 200) {
//      return callback(
//       new Error('Server responded with status code ' + res.statusCode + ':\n' + res.body.toString('utf8')), null);
//     }
  
//     return callback(null, res.body.toString('utf8'));
//    }))
// function tripmanager (req, res) {
//     request( 'GET', url)   
//                 .done(function (result){
//                     return res.json(result.getBody('utf8') || 'RESPONSE EMPTY')            
//             })
// }

// async function getFlightInfo() {       
//     console.log('first')     
//     request( 'GET', 'https://api.coindesk.com/v1/bpi/currentprice.json')   
//         .done(function (result){
//             console.log (result.getBody('utf8') || 'RESPONSE EMPTY')            
//     })
//     console.log('second')
// }

// console.log(getFlightInfo())

// function getFlightInfo(callback) {       
//     console.log('first')     
//     var res = request( 'GET', 'https://api.coindesk.com/v1/bpi/currentprice.json')   
//         .done(function (result){
//             return (result.getBody('utf8') || 'RESPONSE EMPTY')            
//     })
//     console.log('second')
//     callback(res)
// }

// function secondFunction() {
//     getFlightInfo(function() {
//         console.log(res)
//     }       
//     )
// }

// secondFunction()


// A function that returns a promise to resolve into the data //fetched from the API or an error
// THIS WORKS //////////////////////////////////////////////////////////////////////////////////
// let getChuckNorrisFact = (url) => {
//     request('GET', url).done((res) => console.log(JSON.parse(res.getBody().toString()).value))
// };

// function tripman() {
//     console.log('Do this')
//     getChuckNorrisFact(url)
//     console.log('Do that')
// }

// tripman()
// THIS WORKS //////////////////////////////////////////////////////////////////////////////////


// const request = require('request');

// let url = "https://api.chucknorris.io/jokes/random";

// async function getChuckNorrisFact(url) {
//     request( url)
//         .done(result => (JSON.parse(result.getBody().toString()).value))
//         // .then(result => console.log(result))
// };

// getChuckNorrisFact(url).then((res) => console.log(res))


// var res = request( "https://api.chucknorris.io/jokes/random").then(res => (JSON.parse(res.getBody().toString()).value));
// console.log(res);

// var wynik

// let getChuckNorrisFact = (url) => {
//     request('GET', url)
//         .then(result => wynik = (JSON.parse(result.getBody().toString()).value))
//         .then(() => {return wynik})
//         // .then(() => console.log(wynik))
// };

// const promise1 = new Promise ((resolve, reject) => {
//     setTimeout(() => {
//         getChuckNorrisFact(url).then(val => console.log(val))
//     }, 5000)
// })

// promise1.then(vals => {console.log(vals)})

// function tripman() {
//     console.log('Do this')
    
//     console.log('Do that')
// }

// async function getBody() {
//       // Return new promise
//     return new Promise(function (resolve, reject) {
//         // Do async job
//         request( 'GET' , "https://api.chucknorris.io/jokes/random", function (error, res, body) {
//             if (!error && res.statusCode == 200) {
//                 resolve(body)
//             } else {
//                 reject(error)
//             }
//         })          
//     })
// }

// async function main() {
//     let res = await getBody();
//     console.log(res)
// }

// main()

// const request = require('request')

// async function getJoke() {
//     request('https://api.chucknorris.io/jokes/random', function (error, response, body) {
//         // console.error('error:', error); // Print the error if one occurred
//         // console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
//         return ('body:', body); // Print the HTML for the Google homepage.
// });
// }

// getJoke().then(res => console.log(res))


var joke
var finalJoke
const https = require('https');
const http = require('http')

const wowboxGetRequest = (endpoint) => new Promise((resolve, reject) => {
    https.get('https://api.chucknorris.io/jokes/' + endpoint, (resp) => {
    let data = '';

    // A chunk of data has been received.
    resp.on('data', (chunk) => {
        data += chunk;
  });

    // The whole response has been received. Print out the result.
    resp.on('end', () => {
        resolve(JSON.parse(data).value);
  });

}).on("error", (err) => {
  console.log("Error: " + err.message);
});
})

function getIatas(callback)  {
    wowboxGetRequest('random')
        .then(console.log("The joke of today is:"))
        .then((response) => joke = response)
        .then(() => callback(joke))
        .then(console.log('Response received'))
}

getIatas((resp) => {
    finalJoke = resp
    console.log(finalJoke)
})


// some code

// define the promise
// let request_call = new Promise((resolve, reject) => {
// 	http.get('https://api.chucknorris.io/jokes/random', (response) => {
// 		let chunks_of_data = [];

// 		response.on('data', (fragments) => {
// 			chunks_of_data.push(fragments);
// 		});

// 		response.on('end', () => {
// 			let response_body = Buffer.concat(chunks_of_data);
			
// 			// promise resolved on success
// 			resolve(response_body.toString());
// 		});

// 		response.on('error', (error) => {
// 			// promise rejected on error
// 			reject(error);
// 		});
// 	});
// });

// promise resolved or rejected asynchronously
// request_call.then((response) => {
// 	console.log(response);
// }).catch((error) => {
// 	console.log(error);
// });

// some code