import asyncstream from 'ministreamiterator'
import { ServerResponse } from 'http'
import { Update, PatchUpdate, SnapshotUpdate, BraidStream, StringOrBuf, Patch } from './types'

const DEFAULT_HEARTBEAT_SECS = 30

const toBuf = (data: StringOrBuf): Buffer => (
  // Actually Buffer.from(data, 'utf-8') would be fine here but
  // typescript doesn't like it. Eh.
  Buffer.isBuffer(data) ? data
    : typeof data === 'string' ? Buffer.from(data, 'utf-8')
    : Buffer.from(data)
)

const isStringOrBuf = (val: any): val is StringOrBuf => (
  typeof val === 'string'
    || Buffer.isBuffer(val)
    || val instanceof Uint8Array
)

interface StateServerOpts {
  /**
   * Optional headers from request, so we can parse out requested patch type
   * and requested version
   */
  reqHeaders?: NodeJS.Dict<string | string[]>

  initialVerson?: string
  initialValue?: StringOrBuf

  /** HTTP content-type for the resource */
  contentType?: string

  /**
   * Most servers will use a single patch type everywhere. See
   * https://github.com/braid-org/braid-spec/issues/106
   *
   * If this is set, the patchType in each actual patch is assumed to be
   * this value. For now this library will still send the patch type
   * with every patch for compatibility.
   */
  patchType?: 'braid' | 'merge-object' | string
  // encodePatch?: (patch: any) => string | Buffer,

  httpHeaders?: { [k: string]: string | any }

  /**
   * Optional event handler called when the peer disconnects
   */
  onclose?: () => void

  /**
   * Send a heartbeat message every (seconds). Defaults to every 30
   * seconds. This is needed to avoid some browsers (Firefox) closing
   * the connection automatically after a 1 minute timeout.
   *
   * Set to `null` to disable heartbeat messages.
   */
  heartbeatSecs?: number | null
}

export interface MaybeFlushable {
  flush?: () => void
}

const headersToBuf = (headers: Record<string, string>) => (
  Buffer.from(
    Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}\r\n`)
      .join('') + '\r\n'
  )
)

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

const updateIsSnapshot = (upd: Update): upd is SnapshotUpdate => (
  (upd as any).patches === undefined
)

export function stream(
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

  // As per https://github.com/braid-org/braid-spec/issues/106
  if (opts.patchType) httpHeaders['patch-type'] = opts.patchType

  res.writeHead(209, 'Subscription', httpHeaders)

  let connected = true

  const stream = asyncstream<SnapshotUpdate | PatchUpdate>(() => {
    connected = false
    res.end() // will fire res.emit('close') if not already closed
  })

  res.once('close', () => {
    connected = false
    stream.end()
    opts.onclose?.()
  })

  // Using newline heartbeats here.
  // https://github.com/braid-org/braid-spec/issues/104
  if (opts.heartbeatSecs !== null) {
    const heartbeatSecs = opts.heartbeatSecs ?? DEFAULT_HEARTBEAT_SECS
    ;(async () => {
      // 30 second heartbeats to avoid timeouts
      while (true) {
        await new Promise(res => setTimeout(res, heartbeatSecs * 1000))

        if (!connected) break

        res.write(`\n`);
        res.flush?.()
      }
    })()
  }

  ;(async () => {
    if (connected) {
      for await (const upd of stream.iter) {
        if (!connected) break

        // This is the "2nd tier" of headers, i.e. after the HTTP headers, there
        // are "Update" headers, which can include a "Version:" header.
        let updateHeaders: Record<string, string> = { ...upd.headers }

        // Whether we have patches or just a version, include the version here
        if (upd.version != null) updateHeaders['version'] = upd.version

        // This is not in the spec (yet).
        if (upd.patchId != null) updateHeaders['patch-id'] = upd.patchId

        if (updateIsSnapshot(upd)) {
          const valueBuf = toBuf(upd.value)
          updateHeaders['content-length'] = `${valueBuf.length}`
          res.write(Buffer.concat([
            headersToBuf(updateHeaders),
            valueBuf,
            // Braidjs wants a newline here.
            // Buffer.from('\n')
          ]))
        } else {
          // Sending a set of patches
          updateHeaders['patches'] = `${upd.patches.length}`

          // I'm building up a list of message buffers and I'll send
          // them in one res.write() call to cut down on the number of
          // transfer-encoding chunks being sent. This might slightly
          // lower performance - I'm not sure if that matters here.
          const messages = [headersToBuf(updateHeaders)]

          for (let patch of upd.patches) {
            // This is a bit gross. We allow patches to be specified as
            // using their raw buffer / string instead of needing to be
            // wrapped. This is simple but allocation-inefficient.
            if (isStringOrBuf(patch)) patch = {body: patch}
            const {range} = patch

            const patchType = patch.patchType
              ?? (range != null ? 'braid' : null)
              ?? opts.patchType

            if (patchType == null) {
              throw Error('Cannot infer type of patch inside update. Set patch.patchType, patch.range or connection-global opts.patchType.')
            }

            let bodyBuf = toBuf(patch.body)
            const patchHeaders: Record<string, string> = {
              ...patch.headers,
              'content-length': `${bodyBuf.length}`,
            }

            if (range) patchHeaders['content-range'] = range

            if (patchType === 'braid') {
              if (range == null) throw Error('Invalid braid patch - expected range header')
              patchHeaders['content-range'] = range
            } else {
              // TODO: Remove this after issue #106 resolves when the
              // patch is set globally. Also note this will probably be
              // renamed to patch-type in a future version of the spec.
              patchHeaders['content-type'] = patchType
            }

            messages.push(headersToBuf(patchHeaders))
            messages.push(bodyBuf)
          }
          res.write(Buffer.concat(messages))

        }
        res.flush?.()
      }
    }
  })()

  if (opts.initialValue !== undefined) {
    stream.append({
      value: opts.initialValue,
      version: opts.initialVerson,
    })
  }

  return stream
}
