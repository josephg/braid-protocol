const polka = require('polka')
const makeStream = require('braid-protocol')
const fs = require('fs')

const genOp = require('ot-text-unicode/test/genOp')
let doc = 'hi there'

// Every second update the document by modifying it with a patch.

const clients = new Set()

setInterval(() => {
  const [op, result] = genOp(doc)
  doc = result

  for (const c of clients) {
    // c.append(
  }
})

polka()
.get('/', (req, res) => {
  // Could use sirv or something but eh.
  res.setHeader('content-type', 'text/html')
  res.end(fs.readFileSync('test.html'))
})
.get('/doc', (req, res) => {
  const stream = makeStream(res, {
    contentType: 'text/plain',
    initialValue: doc,
    onclose() {
      console.log('removing stream', req.socket.remoteAddress)
      clients.delete(stream)
    }
  })
  clients.add(stream)
  console.log('Added client from', req.stream.remoteAddress)

  // timer = setInterval(() => {
  //   stream.append(new Date().toLocaleString())
  // }, 1000)
})
.listen(2001, err => {
  if (err) throw err
  console.log('listening on http://localhost:2001/doc')
})
