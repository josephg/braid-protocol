const {listen} = require('braid-client')

;(async () => {
  for await (const data of listen('http://localhost:2001/time')) {
    console.log(data)
  }
})()