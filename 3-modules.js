// CommonJS, every file is module (by default)
// Modules - Encapsulated Code (only share minimum)

const names = require('./4-names') // always with a ./
const sayHi = require('./5-utils')
const data = require('./6-alternativeflavor')

// When you import a module you invoke it !!!
require('./7-mindgranade')
console.log(names);
console.log(data)

sayHi('Susan')
sayHi(names.john)
sayHi(names.peter)
