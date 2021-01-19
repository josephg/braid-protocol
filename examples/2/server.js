const polka = require('polka')
const makeStream = require('braid-protocol')
const fs = require('fs')
// const makeStream = require('.')

polka()
.get('/', (req, res) => {
  // Could use sirv or something but eh.
  res.setHeader('content-type', 'text/html')
  res.end(fs.readFileSync('test.html'))
})
.get('/time', (req, res) => {
  let timer

  const stream = makeStream(res, {
    initialValue: new Date().toLocaleString(),
    contentType: 'text/plain',
    onclose() {
      clearInterval(timer)
    }
  })

  timer = setInterval(() => {
    stream.append(new Date().toLocaleString())
  }, 1000)
})
.listen(2000, err => {
  if (err) throw err
  console.log('listening on http://localhost:2000/time')
})
