const { subscribe } = require('@braid-protocol/client-raw')

;(async () => {
  const { updates } = await subscribe('http://localhost:2001/time')
  for await (const { value } of updates) {
    console.log(value)
  }
})()
