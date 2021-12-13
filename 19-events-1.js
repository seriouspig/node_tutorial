const EventEmitter = require('events')

const customEmmiter = new EventEmitter()

// on       - will listen for an event
// emit     - will emit an event
// ORDER MATTERS - first listen then emit

customEmmiter.on('response', (name, id) => {
    console.log(`data received user: ${name} with id: ${id}`)
})
customEmmiter.on('response', () => {
    console.log(`data received 2`)
})

customEmmiter.emit('response', 'john', 34)