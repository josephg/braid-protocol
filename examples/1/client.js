const listen = require('braid-protocol/dist/client').default

;(async () => {
  for await (const data of listen('http://localhost:2000/time')) {
    console.log(data)
  }
})()