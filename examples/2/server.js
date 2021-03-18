const polka = require('polka')
const braid = require('@josephg/braid-server')

const genOp = require('ot-text-unicode/test/genOp')
let doc = 'hi there'

// Set of clients to be updated.
const clients = new Set()

// Every second update the document by modifying it with a patch.
setInterval(() => {
  const [op, result] = genOp(doc)
  // const [op, result] = [['👻'], '👻' + doc]
  doc = result

  const j = JSON.stringify(op)
  // console.log(j.length, j)

  for (const c of clients) {
    c.append({
      patches: [JSON.stringify(op) + '\n']
    })
  }
}, 1000)

polka()
  .get('/doc', (req, res) => {
    const stream = braid.stream(res, {
      reqHeaders: req.headers,
      initialValue: doc + '\n',
      patchType: 'ot-text-unicode',
      contentType: 'text/plain',
      onclose() {
        if (stream) clients.delete(stream)
      },
    })
    if (stream) clients.add(stream)
  })
  .listen(2002, (err) => {
    if (err) throw err
    console.log('listening on http://localhost:2002/doc')
  })
