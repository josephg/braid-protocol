const polka = require('polka')
const braid = require('@josephg/braid-server')

let doc = []

// Set of clients to be updated.
const clients = new Set()

// Every 5 seconds update the document and send its entirety as a patch
// Note: in practice, this would be better as a range-patch because you
// would need to only send a "delta" of what changed; however, this example
// is for testing simple streaming patches, and the simplest patch is to
// send the whole doc again.
setInterval(() => {
  doc.push({ item: doc.length })
  for (const c of clients) {
    c.append({
      data: JSON.stringify(doc) + '\n',
    })
  }
}, 5000)

polka()
  .get('/doc', (req, res) => {
    const stream = braid.stream(res, {
      reqHeaders: req.headers,
      initialValue: JSON.stringify(doc) + '\n',
      contentType: 'application/json',
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
