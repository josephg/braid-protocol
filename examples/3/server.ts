import polka from 'polka'
import bodyParser from 'body-parser'
import { stream, BraidStream } from '@josephg/braid-server'
import { JSONOp, type as json1 } from 'ot-json1'
import { Post } from './shared'

let doc: Post[] = []

// The version is implied as the length of the history array.
interface HistoryEntry {
  id?: string // Unique ID for dedup
  op: JSONOp
}
let history: HistoryEntry[] = []

// Set of clients to be updated.
const clients = new Set<BraidStream>()

const applyPatch = (
  op: JSONOp,
  version: number,
  patchId: string | undefined
) => {
  if (version > history.length) throw Error('Invalid version')

  while (version < history.length) {
    const entry = history[version]
    if (patchId != null && patchId === entry.id) return // Operation already applied.

    op = json1.transformNoConflict(op, entry.op, 'left')
    version++
  }

  doc = json1.apply(doc as any, op) as any
  history.push({
    id: patchId,
    op,
  })

  console.log('applied change with id', patchId, 'doc is', doc)

  // And broadcast the operation to clients.
  for (const c of clients) {
    c.append({
      patchType: json1.name,
      patchId,
      version: `${version}`,
      data: JSON.stringify(op) + '\n',
    })
  }
}

const app = polka()

app.get('/doc', (req, res) => {
  const s = stream(res, {
    reqHeaders: req.headers,
    initialValue: JSON.stringify(doc, null, 2) + '\n',
    initialVerson: `${history.length}`,
    contentType: 'application/json',
    onclose() {
      if (s) clients.delete(s)
    },
  })
  if (s) clients.add(s)
})

app.put('/doc', bodyParser.json(), (req, res, next) => {
  const patchType = req.headers['patch-type']
  if (patchType !== json1.name)
    return next(Error('Missing or unsupported patch type'))

  let parents = req.headers['parents']
  if (parents == null || Array.isArray(parents))
    return next(Error('Missing parents field'))
  parents = parents.trim()
  if (parents.startsWith('"')) parents = parents.slice(1, -1) // Trim off ""

  // The parents in this case will contain 1 item, a number, quoted like this: `Parents: "123"`
  const version = parseInt(parents)
  if (isNaN(version)) return next(Error('Invalid parents field'))

  const op = req.body
  const opId = req.headers['patch-id']

  applyPatch(op, version, opId as string | undefined)

  // The version header will be ignored. We don't care.
  res.end()
})

app.listen(2003, (err: Error) => {
  if (err) throw err
  console.log('listening on http://localhost:2003/doc')
})
