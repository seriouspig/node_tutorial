const path = require('path')

console.log(path.sep); // Platform specific separator

const filePath = path.join('/content', 'subfolder', 'test.txt')
console.log(filePath);

const base = path.basename(filePath)
console.log(base)

// Rerun absolute path
const absolute = path.resolve(__dirname, 'content', 'subfolder', 'test.txt')
console.log(absolute);