const { subscribe } = require('@josephg/braid-client-raw')
const { type } = require('ot-text-unicode')

;(async () => {
  let value = undefined
  const { updates } = await subscribe('http://localhost:2002/doc')
  for await (const data of updates) {
    if (data.type === 'snapshot') {
      // Snapshot updates replace the current value
      value = data.value
    } else {
      // Or with patches we apply all the patches we're given in sequence
      for (const {body} of data.patches) {
        value = type.apply(value, body)
      }
    }
    console.log(value)
  }
})()
