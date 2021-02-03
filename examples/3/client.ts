import {subscribeRaw} from '@josephg/braid-client'
import {JSONOp, type as json1, insertOp, Doc} from 'ot-json1'
import {Post} from './shared'
import makeStream, {Stream} from 'ministreamiterator'

const decoder = new TextDecoder()

interface StreamItem {
  doc: Post[],
  op: JSONOp,
  isLocal: boolean,
}
const stream = makeStream<StreamItem>()

const transformX = (op1: JSONOp, op2: JSONOp): [JSONOp, JSONOp] => ([
  json1.transformNoConflict(op1, op2, 'left'),
  json1.transformNoConflict(op2, op1, 'right'),
])

;(async () => {
  const {streamHeaders, patches} = await subscribeRaw('http://localhost:2003/doc')
  console.log('stream headers', streamHeaders)

  const first = await patches.next()
  if (first.done) throw Error('No messages in stream')

  console.log('first headers', first.value.headers)
  let doc: Post[] = JSON.parse(decoder.decode(first.value.data))
  let serverVersion = first.value.headers['version']

  // Operations waiting to be sent
  let pendingOp: JSONOp = null
  // Operations waiting to be acknowledged
  let inflightOp: {op: JSONOp, id: string} | null = null

  const processStream = async () => {
    let patchType = 'snapshot'
    for await (const data of patches) {
      // console.log('patch headers', data.headers)

      const id = data.headers['patch-id']
      if (data.headers['patch-type']) patchType = data.headers['patch-type']

      if (inflightOp != null && id === inflightOp.id) {
        // Operation confirmed!
        inflightOp = null
        flushPending()
      } else {
        serverVersion = data.headers['version']
        if (patchType !== json1.name) throw Error('unsupported patch type')

        let op = JSON.parse(decoder.decode(data.data)) as JSONOp

        // Transform the incoming operation by any operations queued up to be
        // sent in the client.
        if (inflightOp != null) [inflightOp.op, op] = transformX(inflightOp.op, op)
        if (pendingOp != null) [pendingOp, op] = transformX(pendingOp, op)

        doc = json1.apply(doc as any, op) as any

        stream.append({
          doc,
          op,
          isLocal: false
        })

        // console.log('Got patch - new serverVersion', serverVersion)
        // console.log('Doc', doc)
      }
    }
  }
  processStream()

  const sendInflight = async () => {
    // Could just ignore - but this should never happen.
    if (inflightOp == null) throw Error('Invalid call to sendInFlight')

    const res = await fetch('http://localhost:2003/doc', {
      method: 'PUT',
      headers: {
        'patch-id': inflightOp.id,
        'patch-type': json1.name,
        'parents': serverVersion,
        'content-type': 'application/json',
      },
      body: JSON.stringify(op)
    })

    console.log(await res.text())

    // Ok - operation was acknowledged. Bump it.
    // inflightOp = null
    // flushPending()
  }

  const flushPending = () => {
    // We'll use only a single operation in-flight at once, to keep things a bit
    // simpler.
    if (inflightOp != null || pendingOp == null) return

    // Ok - set the pending operation in flight.
    inflightOp = {
      op: pendingOp,
      id: `${Math.random()}`.slice(2)
    }
    pendingOp = null
    sendInflight()
  }

  const submitChange = (op: JSONOp) => {
    doc = json1.apply(doc as any, op as any) as any
    pendingOp = json1.compose(pendingOp, op)

    stream.append({
      doc,
      op,
      isLocal: true,
    })

    flushPending()
  }

  // Submit an operation adding a new entry.
  const newEntry: Post = {title: 'hi', content: `${Math.random()}`.slice(2)}
  const op = insertOp([doc.length], newEntry as any)
  submitChange(op)
})()

/// *****

;(async () => {
  for await (const value of stream.iter) {
    console.log('isLocal', value.isLocal, 'value', value.doc)
  }
})()
