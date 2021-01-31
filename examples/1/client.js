const {subscribe} = require('@josephg/braid-client')

;(async () => {
  for await (const data of subscribe('http://localhost:2001/time')) {
    console.log(data)
  }
})()