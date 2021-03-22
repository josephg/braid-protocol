const { subscribe } = require('@josephg/braid-client-raw')

const elem = document.getElementById('time')

elem.innerText = 'loading'
;(async () => {
  const { updates } = await subscribe('http://localhost:2001/time')
  for await (const { value } of updates) {
    elem.innerText = value
  }
  elem.innerText = 'disconnected'
})()
