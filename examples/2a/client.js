const {subscribe} = require('@josephg/braid-client')

;(async () => {
  const {initialValue, stream} = 
    await subscribe('http://localhost:2002/doc', {
      applyPatch: () => console.log('received patch')
    })
  console.log(initialValue)
  for await (const data of stream) {
    console.log(data.value)
  }
})()