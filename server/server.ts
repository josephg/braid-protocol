import { ServerResponse } from 'http'
import asyncstream, { Stream } from 'ministreamiterator'

// TODO: Should probably allow ArrayBuffer too.
export type StringLike = string | Buffer

interface StateServerOpts {
  /**
   * Optional headers from request, so we can parse out requested patch type
   * and requested version
   */
  reqHeaders?: NodeJS.Dict<string | string[]>

  initialVerson?: string
  initialValue?: StringLike

  /** The type of the referred content (content-type if you issued a GET on the resource) */
  contentType?: string

  /** Defaults to snapshot - aka, each patch will contain a new copy of the data. */
  patchType?: 'snapshot' | 'merge-object' | string
  // encodePatch?: (patch: any) => string | Buffer,

  // patchMode: 'loose' | 'strict' // ???

  httpHeaders?: { [k: string]: string | any }

  /**
   * Optional event handler called when the peer disconnects
   */
  onclose?: () => void

  /**
   * Send a heartbeat message every (seconds). Defaults to every 30 seconds.
   * This is needed to avoid some browsers closing the connection automatically
   * after a 1 minute timeout.
   *
   * Set to `null` to disable heartbeat messages.
   */
  heartbeatSecs?: number | null
}

export interface MaybeFlushable {
  flush?: () => void
}

interface StateMessage {
  headers?: { [k: string]: string | any }
  patchType?: string // If missing, defaults to 'snapshot'.
  data: StringLike // encoded patch
  version?: string
}

export type BraidStream = Stream<StateMessage>

const writeHeaders = (
  stream: ServerResponse,
  headers: Record<string, string>
) => {
  stream.write(
    Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}\r\n`)
      .join('') + '\r\n'
  )
}

const toBuf = (data: StringLike): Buffer =>
  typeof data === 'string' ? Buffer.from(data, 'utf8') : data

/*

Switches:

- Are we sending snapshots or are we sending patches?
- When is the client up-to-date?

- The client can request changes from some specified version
- And the updates can name a version

- Patch type can change per message (according to the current braid spec)

- Client can send accepts-patch header to name which patch types it understands

*/

function sendInitialValOnly(res: ServerResponse, opts: StateServerOpts): void {
  // TODO: Not actually sure what we should do in this case.
  if (!opts.initialValue) {
    throw Error(
      'Cannot send a single value to a client that does not subscribe'
    )
  }

  const httpHeaders = {
    ...opts.httpHeaders,
  }

  if (opts.contentType) httpHeaders['content-type'] = opts.contentType
  if (opts.initialVerson) httpHeaders['version'] = opts.initialVerson

  let bufData = toBuf(opts.initialValue)
  httpHeaders['content-length'] = bufData.length

  res.writeHead(200, 'OK', httpHeaders)
  res.end(bufData)

  if (opts.onclose) process.nextTick(opts.onclose)
}

export default function stream(
  res: ServerResponse & MaybeFlushable,
  opts: StateServerOpts = {}
): BraidStream | void {
  // These headers are sent both in the HTTP response and in the first SSE
  // message, because there's no API for reading these headers back from
  // EventSource in the browser.

  // If the client did not request a subscription, we'll just pass them the
  // initial value and bail.
  if (opts.reqHeaders && opts.reqHeaders['subscribe'] !== 'keep-alive') {
    return sendInitialValOnly(res, opts)
  }

  const httpHeaders: Record<string, string> = {
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    ...opts.httpHeaders,
  }

  let contentType = opts.contentType ?? null
  if (contentType != null) httpHeaders['content-type'] = contentType
  if (opts.patchType) httpHeaders['patch-type'] = opts.patchType

  res.writeHead(209, 'Subscription', httpHeaders)

  let connected = true

  const stream = asyncstream<StateMessage>(() => {
    connected = false
    res.end() // will fire res.emit('close') if not already closed
  })

  res.once('close', () => {
    connected = false
    stream.end()
    opts.onclose?.()
  })

  // if (opts.heartbeatSecs !== null) {
  //   ;(async () => {
  //     // 30 second heartbeats to avoid timeouts
  //     while (true) {
  //       await new Promise(res => setTimeout(res, 30*1000))

  //       if (!connected) break

  //       res.write(`:\n`);
  //       // res.write(`event: heartbeat\ndata: \n\n`);
  //       // res.write(`data: {}\n\n`)
  //       res.flush?.()
  //     }
  //   })()
  // }
  ;(async () => {
    if (connected) {
      let lastPatchType = 'snapshot'

      for await (const val of stream.iter) {
        if (!connected) break
        // console.log('got val', val)

        const data = toBuf(val.data)

        const patchHeaders: Record<string, string> = {
          // 'content-type': 'application/json',
          // 'patch-type': 'snapshot',
          'content-length': `${data.length}`,
          ...val.headers,
        }
        if (val.version) patchHeaders['version'] = val.version
        if (val.patchType && val.patchType !== lastPatchType) {
          patchHeaders['patch-type'] = lastPatchType = val.patchType
        }

        writeHeaders(res, patchHeaders)
        res.write(data)
        res.flush?.()
      }
    }
  })()

  if (opts.initialValue !== undefined) {
    stream.append({
      data: opts.initialValue,
      version: opts.initialVerson,
    })
  }

  return stream
}

module.exports = stream
