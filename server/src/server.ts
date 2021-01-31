import { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "http";
import asyncstream from 'ministreamiterator'

interface StateServerOpts<T> {
  /**
   * Optional headers from request, so we can parse out requested patch type
   * and requested version
   */
  // reqHeaders?: IncomingHttpHeaders,

  initialVerson?: string
  initialValue?: T

  /** The type of the referred content (content-type if you issued a GET on the resource) */
  contentType?: string

  /** Defaults to snapshot - aka, each patch will contain a new copy of the data. */
  patchType?: 'snapshot' | 'merge-object' | string

  // patchMode: 'loose' | 'strict' // ???

  httpHeaders?: {[k: string]: string | any},

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
  headers?: {[k: string]: string | any},
  data: string | Buffer, // encoded patch
  version?: string
}

const writeHeaders = (stream: ServerResponse, headers: Record<string, string>) => {
  stream.write(
    Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('')
    + '\r\n'
  )
}

/*

Switches:

- Are we sending snapshots or are we sending patches?
- When is the client up-to-date?

- The client can request changes from some specified version
- And the updates can name a version

- Patch type can change per message (according to the current braid spec)

- Client can send accepts-patch header to name which patch types it understands

*/

export default function stream<T>(res: ServerResponse & MaybeFlushable, opts: StateServerOpts<T> = {}) {
  // These headers are sent both in the HTTP response and in the first SSE
  // message, because there's no API for reading these headers back from
  // EventSource in the browser.

  const httpHeaders: Record<string, string> = {
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    ...opts.httpHeaders
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
      for await (const val of stream.iter) {
        if (!connected) break
        // console.log('got val', val)

        const data = Buffer.from(`${val.data}\n`, 'utf8')

        const patchHeaders: Record<string, string> = {
          // 'content-type': 'application/json',
          // 'patch-type': 'snapshot',
          'content-length': `${data.length}`,
          ...val.headers
        }
        if (val.version) patchHeaders['version'] = val.version

        writeHeaders(res, patchHeaders)
        res.write(data)
        res.flush?.()
      }
    }
  })()

  // let headersSent = false
  const append = (patch: any, version?: string) => {
    if (!connected) return

    let message: StateMessage = {data: patch}
    if (version != null) message.version = version

    // console.log('append', message)
    stream.append(message)
  }

  if (opts.initialValue !== undefined) {
    append(opts.initialValue, opts.initialVerson)
  }

  return { stream, append }
}

module.exports = stream
