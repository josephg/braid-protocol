const { subscribe } = require('@josephg/braid-client')

;(async () => {
  const { stream } = await subscribe('http://localhost:2001/time')
  for await (const { value } of stream) {
    console.log(value)
  }
})()
