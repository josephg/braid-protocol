const { subscribe } = require('@josephg/braid-client')

;(async () => {
  const { stream } = await subscribe('http://localhost:2002/doc')
  for await (const data of stream) {
    console.log(data.value)
  }
})()
