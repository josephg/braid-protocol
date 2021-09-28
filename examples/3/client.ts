import { subscribeRaw } from '@braid-protocol/client-raw'
import { JSONOp, type as json1, insertOp, Doc } from 'ot-json1'
import { Post } from './shared'
import makeStream, { Stream } from 'ministreamiterator'

const decoder = new TextDecoder()

interface StreamItem<T> {
  value: T
  version: string
  op: JSONOp
  isLocal: boolean
}

const transformX = (op1: JSONOp, op2: JSONOp): [JSONOp, JSONOp] => [
  json1.transformNoConflict(op1, op2, 'left'),
  json1.transformNoConflict(op2, op1, 'right'),
]

const subscribeOT = async <T>(url: string) => {
  const stream = makeStream<StreamItem<T>>()

  const { streamHeaders, updates } = await subscribeRaw(url)
  // console.log('stream headers', streamHeaders)

  // The first value should contain the document itself. For now I'm just
  // hardcoding this - but this should deal correctly with known versions and
  // all that jazz.
  const first = await updates.next()
  if (first.done) throw Error('No messages in stream')

  // console.log('first headers', first.value.headers)
  if (first.value.type !== 'snapshot') throw Error('Expected subscription to start with a snapshot')
  let doc: T = JSON.parse(decoder.decode(first.value.value))
  let serverVersion = first.value.headers['version']

  // Operations waiting to be sent
  let pendingOp: JSONOp = null
  // Operations waiting to be acknowledged
  let inflightOp: { op: JSONOp; id: string } | null = null

  const processStream = async () => {
    for await (const data of updates) {
      const id = data.headers['patch-id']

      if (inflightOp != null && id === inflightOp.id) {
        // Operation confirmed!
        inflightOp = null
        flushPending()
      } else {
        serverVersion = data.headers['version']

        if (data.type === 'snapshot') {
          // Snapshot updates replace the contents of the document. Only
          // the first message in the subscription will be a snapshot
          // update here - though we may get them when reconnecting if
          // the server doesn't have context to catch up.

          // I'd implement it by replacing doc with the new value, but
          // we would also need to discard pending / inflight ops and
          // thats tricky.
          throw Error('Snapshot update inside the stream not supported')
        } else {
          // We'll only get one patch per message anyway, but eh.
          for (const {headers, body} of data.patches) {
            const patchType = headers['content-type']
              ?? headers['patch-type']
              ?? streamHeaders['patch-type']
            if (patchType !== json1.name) throw Error('unsupported patch type')

            let op = JSON.parse(decoder.decode(body)) as JSONOp

            // Transform the incoming operation by any operations queued up to be
            // sent in the client.
            if (inflightOp != null)
              [inflightOp.op, op] = transformX(inflightOp.op, op)
            if (pendingOp != null) [pendingOp, op] = transformX(pendingOp, op)

            doc = json1.apply(doc as any, op) as any

            stream.append({
              value: doc,
              version: serverVersion,
              op,
              isLocal: false,
            })
          }
        }
      }
    }
  }
  // This method is only called once anyway. I'd do it with ;(async () => {})() but for
  // some reason that confuses the TS typechecker.
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
      body: JSON.stringify(inflightOp.op),
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
      id: `${Math.random()}`.slice(2),
    }
    pendingOp = null
    sendInflight()
  }

  const submitChange = (op: JSONOp) => {
    doc = json1.apply(doc as any, op as any) as any
    pendingOp = json1.compose(pendingOp, op)

    stream.append({
      value: doc,
      version: serverVersion,
      op,
      isLocal: true,
    })

    flushPending()
  }

  return {
    patches: stream.iter,
    submitChange,
    initialValue: doc,
    initialVerson: serverVersion,
  }
}

;(async () => {
  const { patches, submitChange, initialValue } = await subscribeOT<Post[]>(
    'http://localhost:2003/doc'
  )

  console.log('Connected. Initial document value', initialValue)

  // Submit an operation adding a new entry.
  const newEntry: Post = { title: 'hi', content: `${Math.random()}`.slice(2) }
  const op = insertOp([initialValue.length], newEntry as any)
  submitChange(op)

  // And stream changes to the console.
  for await (const data of patches) {
    console.log(data.isLocal ? 'Got local' : 'Got remote', 'op. New value:', data.value)
  }
})()
