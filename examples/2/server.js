const polka = require('polka')
const makeStream = require('@josephg/braid-server')
const fs = require('fs')

const genOp = require('ot-text-unicode/test/genOp')
let doc = 'hi there'

// Set of clients to be updated.
const clients = new Set()

// Every second update the document by modifying it with a patch.
setInterval(() => {
  const [op, result] = genOp(doc)
  doc = result

  for (const c of clients) {
    c.append({data: JSON.stringify(op) + '\n'})
  }
}, 1000)


polka()
.get('/', (req, res) => {
  // Could use sirv or something but eh.
  res.setHeader('content-type', 'text/html')
  res.end(fs.readFileSync('test.html'))
})
.get('/doc', (req, res) => {
  const stream = makeStream(res, {
    reqHeaders: req.headers,
    initialValue: doc + '\n',
    contentType: 'text/plain',
    patchType: 'ot-text-unicode',
    onclose() {
      if (stream) clients.delete(stream)
    }
  })
  if (stream) clients.add(stream)
})
.listen(2002, err => {
  if (err) throw err
  console.log('listening on http://localhost:2002/doc')
})
