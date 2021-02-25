const { subscribe } = require('@josephg/braid-client')

;(async () => {
  const { stream } = await subscribe('http://localhost:2002/doc')
  const initialVersion = (await stream.next()).value
  console.log('initial value', initialVersion.value)
  for await (const version of stream) {
    console.log('patch', version.patches)
  }
})()
