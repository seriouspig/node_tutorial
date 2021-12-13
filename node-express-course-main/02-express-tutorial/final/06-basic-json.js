const express = require('express')
const app = express()
const { products, people } = require('./data')
app.get('/', (req, res) => {
  res.json(people)
})

app.listen(5000, () => {
  console.log('Server is listening on port 5000....')
})
