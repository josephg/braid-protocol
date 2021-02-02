const polka = require('polka')
const makeStream = require('@josephg/braid-server')
const fs = require('fs')

const getDate = () => (new Date().toLocaleString() + '\n')


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
      initialValue: getDate(),
      contentType: 'text/plain',
      onclose() {
        clearInterval(timer)
      }
    })

    timer = setInterval(() => {
      stream.append({data: getDate()})
    }, 1000)
  } else {
    res.end(getDate())
  }
})
.listen(2001, err => {
  if (err) throw err
  console.log('listening on http://localhost:2001/time')
})
