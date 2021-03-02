const { subscribe } = require('@josephg/braid-client')
const { type } = require('ot-text-unicode')

const applyPatch = (prev, patchType, patch) => {
  if (patchType !== 'ot-text-unicode') throw Error('not supported patch type')

  // console.log(new TextDecoder().decode(patch))
  const op = JSON.parse(new TextDecoder().decode(patch))
  return type.apply(prev, op)
}

;(async () => {
  const { stream } = await subscribe('http://localhost:2002/doc')
  for await (const data of stream) {
    console.log(data.value)
  }
})()
