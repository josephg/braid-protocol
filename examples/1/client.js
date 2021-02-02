const {subscribe} = require('@josephg/braid-client')

;(async () => {
  const {initialValue, stream} = await subscribe('http://localhost:2001/time')
  console.log('initial value', initialValue)
  for await (const {value} of stream) {
    console.log(value)
  }
})()