const polka = require('polka')
const braid = require('@braid-protocol/server')

let doc = []

// Set of clients to be updated.
const clients = new Set()

// Every second, update the document and append an item.
setInterval(() => {
  const item = { item: doc.length }
  doc.push(item)
  for (const c of clients) {
    c.append({
      patches: [{
        range: '[-0:-0]',
        body: JSON.stringify(item) + '\n',
      }],
    })
  }
}, 1000)

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
