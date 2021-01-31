const polka = require('polka')
const makeStream = require('braid-protocol')
const fs = require('fs')
// const makeStream = require('.')

const getDate = () => new Date().toLocaleString()

polka()
.get('/', (req, res) => {
  // Could use sirv or something but eh.
  res.setHeader('content-type', 'text/html')
  res.end(fs.readFileSync('test.html'))
})
.get('/time', (req, res) => {
  let timer

  if (req.headers.subscribe === "keep-alive") {
    const stream = makeStream(res, {
      initialValue: new Date().toLocaleString(),
      contentType: 'text/plain',
      onclose() {
        clearInterval(timer)
      }
    })

    timer = setInterval(() => {
      stream.append(getDate())
    }, 1000)
  } else {
    res.end(getDate())
  }
})
.listen(2000, err => {
  if (err) throw err
  console.log('listening on http://localhost:2000/time')
})
