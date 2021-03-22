const { subscribe } = require('@josephg/braid-client-raw')

;(async () => {
  const { updates } = await subscribe('http://localhost:2002/doc')
  const initialVersion = (await updates.next()).value
  console.log('initial value', initialVersion.value)
  for await (const version of updates) {
    console.log('patch', version.patches)
  }
})()
