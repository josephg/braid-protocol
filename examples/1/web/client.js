const {subscribe} = require('@josephg/braid-client')

const elem = document.getElementById('time')

elem.innerText = 'loading'

;(async () => {
  const {initialValue, stream} = await subscribe('http://localhost:2001/time')
  elem.innerText = initialValue

  for await (const {value} of stream) {
    elem.innerText = value
  }
  elem.innerText = "disconnected"
})()