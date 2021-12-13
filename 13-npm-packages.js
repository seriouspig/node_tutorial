// npm  - global command, comes with node
// mpm --version

// local dependency - use it only in this particular project
// npm i <packageName> 

// global dependency - use it in any project
// npm install -g <packageName>
// sudo npm install -g <packageName> (mac)

// npm install nodemon -D - install as dev dependency (we only need to use it in production)

// package.json - manifest file (stores important info about project/package)
// manual approach (create package.json in the root, create properties etc)
// npm init (step by step, press enter to skip)
// npm init -y (everything default)

const _ = require('lodash')

const items = [1,[2,[3,[4]]]]
const newItems = _.flattenDeep(items)
console.log(newItems)

// npm install - installs all dependencies after cloning

// IN THE package.json:
// "scripts": {
//     "start":"node app.js",   - starts with       npm start
//     "dev": "nodemon app.js"  - starts with       npm run dev
//   },

// uninstall packages
// npm uninstall <packageName>