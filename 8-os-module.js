// in-build modules - no need to install anything
const os = require('os')

// infot aobut current user
const user = os.userInfo()
console.log(user);

// how long computer has been running - system uptime in seconds
console.log(`The system uptime is ${os.uptime()} seconds`);

const currentOS = {
    name: os.type(),
    release: os.release(),
    totalMem: os.totalmem(),
    freeMem: os.freemem()
}

console.log(currentOS);