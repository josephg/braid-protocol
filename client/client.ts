import 'isomorphic-fetch'
import { Readable } from 'stream'

const splitOnce = (
  s: string,
  sep: string | RegExp
): [string, string] | null => {
  const pos = s.search(sep)
  if (pos < 0) return null
  else {
    const remainder = s.slice(pos)
    // Figure out the length of the separator using the regular expression

    // TODO: Why am I calling match twice, here and above? Fix to only do that
    // once.
    const sepLen =
      typeof sep === 'string' ? sep.length : remainder.match(sep)![0].length
    return [s.slice(0, pos), remainder.slice(sepLen)]
  }
}

const concatBuffers = (a: Uint8Array, b: Uint8Array) => {
  const result = new Uint8Array(a.length + b.length)
  result.set(a, 0)
  result.set(b, a.length)
  return result
}

const asciiDecoder = new TextDecoder('ascii')
const headerSepRegex = /\r?\n\r?\n/
const searchHeaderGap = (buf: Uint8Array): null | [string, number] => {
  // Search the buffer for the \r\n\r\n between header and data. We have some
  // confidence the header will be pure ASCII - but even if not, I think the
  // ascii decoder should always preserve byte length. (I hope.)

  // This method returns null if the header has not been terminated, or the
  // header string + byte offset of the body.

  // There's no good methods for doing substring search in an arraybuffer in
  // javascript, so we'll (somewhat inefficiently) do extra decoding operations.
  // This is probably fine - though will become inefficient if the chunk size is
  // particularly large
  const s = asciiDecoder.decode(buf)
  const match = s.match(headerSepRegex)

  if (match == null) return null
  else {
    return [s.slice(0, match.index), match.index! + match[0].length]
  }
}

const decoder = new TextDecoder()

async function* readHTTPChunks(res: Response): AsyncGenerator<VersionData> {
  // Medium-sized state machine. We swap back and forth from reading the headers <->
  // reading data. Every chunk must contain a content-length field. If we encounter
  // a Patches header, we count out the patches (each with headers & content) and return
  // them inside a version.
  const enum State {
    VersionHeaders,
    VersionContent,
    PatchHeaders,
    PatchContent,
  }
  let state = State.VersionHeaders
  let buffer = new Uint8Array() // never used.
  let versionHeaders: Record<string, string> | null = null
  let patchHeaders: Record<string, string> | null = null
  let patches: Array<Patch> = []
  let patchesCount: number = 0

  function getNextHeaders(): Record<string, string> | null {
    // Ok, so there's a problem here: We need to search for the
    // double-newline seperator between header and data. The header should
    // be pure ASCII, but the data section can (and will) contain utf8
    // characters. These characters may be split between message chunks,
    // too! And the named content-length is specified in bytes.
    const headerData = searchHeaderGap(buffer)
    if (headerData == null) return null
    else {
      const [headerStr, dataOffset] = headerData

      const headers = Object.fromEntries(
        headerStr.split(/\r?\n/).map((entry) => {
          const kv = splitOnce(entry, ': ')
          if (kv == null) throw Error(`invalid HTTP header: ${entry}`)
          else return [kv[0].toLowerCase(), kv[1]]
        })
      )

      buffer = buffer.slice(dataOffset)
      return headers
    }
  }

  function* append(s: Uint8Array): Generator<VersionData> {
    // This is pretty inefficient, but it's probably fine.
    buffer = concatBuffers(buffer, s)

    while (true) {
      // console.log('while', state, buffer.length, asciiDecoder.decode(buffer))
      // Read as much as we can.
      if (state == State.VersionHeaders) {
        const nextHeaders = getNextHeaders()
        if (nextHeaders) {
          versionHeaders = nextHeaders
          if (versionHeaders['patches']) {
            patchesCount = parseInt(versionHeaders['patches'], 10)
            state = State.PatchHeaders
          } else {
            state = State.VersionContent
          }
        } else {
          break
        }
      } else if (state == State.VersionContent) {
        if (versionHeaders == null) throw Error('invalid state')

        const contentLength = versionHeaders['content-length']
        if (contentLength != null) {
          const contentLengthNum = parseInt(contentLength)
          if (isNaN(contentLengthNum) || contentLengthNum < 0)
            throw Error('invalid Content-Length')

          if (buffer.length < contentLengthNum) break
          else {
            const data = buffer.slice(0, contentLengthNum)
            yield { headers: versionHeaders, data }
            buffer = buffer.slice(contentLengthNum)
            versionHeaders = null
            state = State.VersionHeaders
          }
        } else {
          throw Error('Content-Length or Patches required')
        }
      } else if (state == State.PatchHeaders) {
        if (versionHeaders == null) throw Error('invalid state')

        const nextHeaders = getNextHeaders()
        if (nextHeaders) {
          patchHeaders = nextHeaders
        } else {
          break
        }

        state = State.PatchContent
      } else if (state == State.PatchContent) {
        if (versionHeaders == null) throw Error('invalid state')
        if (patchHeaders == null) throw Error('invalid state')

        const contentLength = patchHeaders['content-length']

        if (contentLength != null) {
          const contentLengthNum = parseInt(contentLength)
          if (isNaN(contentLengthNum) || contentLengthNum < 0)
            throw Error('invalid Content-Length')

          if (buffer.length < contentLengthNum) break
          else {
            const data = buffer.slice(0, contentLengthNum)
            // We don't yield yet, because we need all the patches for this
            // version together. Push onto array and send later.
            patches.push({ headers: patchHeaders, data })
            buffer = buffer.slice(contentLengthNum)
            patchHeaders = null

            // One fewer patches in this version to process
            patchesCount--

            if (patchesCount == 0) {
              yield { headers: versionHeaders, patches }
              state = State.VersionHeaders
              patches = []
              versionHeaders = null
              patchHeaders = null
            } else {
              // Go back to processing next patch (or done)
              state = State.PatchHeaders
            }
          }
        } else {
          throw Error('Content-Length or Patches required')
        }
      }
    }
  }

  // Apparently node-fetch doesn't implement the WhatWG's stream protocol for
  // some reason. Instead it shows up as a nodejs stream.
  if (res.body && (res.body as any)[Symbol.asyncIterator] != null) {
    // We're in nodejs land, and the body is a nodejs stream object.
    const body = (res.body as any) as Readable

    // There's a bug where none of these events fire when the underlying TCP
    // connection disappears. Its fixed in node-fetch@next.

    // body.on('error', err => console.error(err))
    // body.on('end', () => console.log('end'))
    // body.on('close', () => console.log('close'))

    for await (const item of body) {
      yield* append(item)
    }
  } else {
    // We're in browser land and we can get a ReadableStream
    const reader = res.body!.getReader()
    // reader.closed.then(() => console.log('closed'), err => console.error('err', err))

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        yield* append(value!)
      }
    } catch (e) {
      console.warn('Connection died', e)
    }
  }
}

export interface SubscribeOptions {
  reqHeaders?: Record<string, string>
}

type Patch = {
  headers: Record<string, string>
  data: Uint8Array
}

type VersionData = {
  headers: Record<string, string>
  patches?: Array<Patch>
  data?: Uint8Array
}

export async function subscribeRaw(url: string, opts: SubscribeOptions = {}) {
  const res = await fetch(url, {
    // url,
    headers: {
      subscribe: 'keep-alive',
      ...opts.reqHeaders,
    },
  })

  return {
    streamHeaders: Object.fromEntries(res.headers),
    versions: readHTTPChunks(res),
  }
}

export async function subscribe(url: string, opts: SubscribeOptions = {}) {
  const { streamHeaders, versions } = await subscribeRaw(url, opts)
  const contentType = streamHeaders['content-type']
  const currentVersions: string = streamHeaders['current-versions'] ?? null

  async function* consumeVersions() {
    for await (const version of versions) {
      if (version.data) {
        const data = version.data
        const value = defaultToDoc(contentType, data)
        yield {
          value,
          headers: version.headers,
        }
      } else if (version.patches) {
        const patches = version.patches.map((patch) => ({
          headers: patch.headers,
          value: defaultToDoc(contentType, patch.data),
        }))
        yield {
          patches,
          headers: version.headers,
        }
      }
    }
  }

  return {
    currentVersions,
    streamHeaders,
    stream: consumeVersions(),
  }
}

export interface StateClientOptions<T = any> {
  toDoc?: (contentType: string, content: Uint8Array) => T
  applyPatch?: (prevValue: T, patchType: string, patch: Uint8Array) => T

  /**
   * If the client knows the value of the document at some specified version,
   * set knownDoc and knownAtVersion. The server can elide intervening
   * operations and just bring the client up to date.
   */
  knownDoc?: T
  knownAtVersion?: string

  /**
   * If knownAtVersion is behind the current server version, emit all
   * intermediate operations in the iterator. Do not wait until the client is
   * up-to-date before returning.
   *
   * Has no effect if knownAtVersion is unset.
   */
  emitAllPatches?: boolean
}

const defaultToDoc = (contentType: string, content: Uint8Array) => {
  // This is vastly incomplete and a compatibility nightmare.
  return contentType.startsWith('text/')
    ? decoder.decode(content)
    : contentType.startsWith('application/json')
    ? JSON.parse(decoder.decode(content))
    : content
}

// const merge = <T>(prevValue: T, patchType: string, patch: any, opts: StateClientOptions<any>): T => {
//   switch (patchType) {
//     case 'snapshot': return patch
//     case 'merge-keys': {
//       // This just merges the two objects together.
//       return {...prevValue, ...patch}
//     }
//     default: {
//       throw Error('Unknown patch type: ' + patchType)
//       // return patch
//     }
//   }
// }

export async function subscribeApply(
  url: string,
  opts: StateClientOptions = {}
) {
  let value: any = opts.knownDoc
  let version: string | null = opts.knownAtVersion ?? null

  const reqHeaders: Record<string, string> = {}
  if (opts.knownAtVersion != null) reqHeaders['version'] = opts.knownAtVersion

  // probably need 'accept-patch': 'merge-object', here for backwards compat
  const { streamHeaders, versions: patches } = await subscribeRaw(url)
  const contentType = streamHeaders['content-type']
  const upToDateVersion: string | null = streamHeaders['version'] ?? null
  let patchType = streamHeaders['patch-type'] || 'snapshot'

  const apply = ({ headers, data }: VersionData) => {
    if (headers['patch-type']) patchType = headers['patch-type']
    if (headers['version']) version = headers['version']

    if (patchType === 'snapshot') {
      value = (opts.toDoc ?? defaultToDoc)(
        contentType,
        data || new Uint8Array()
      )
      // return {value, headers}
    } else {
      if (!opts.applyPatch)
        throw Error('Cannot patch documents without an apply function')
      value = opts.applyPatch(value, patchType, data || new Uint8Array())
      // return {value, headers, patch: data}
    }
  }

  // This method will wait until we have the first known-good value before
  // returning. There's three cases when this happens. Either:
  //
  // 1. The client already knows the value at the current version
  //    (upToDateVersion === knownAtVersion).
  // 2. There is no known version. The first message from the server should have
  //    a snapshot. Return that.
  // 3. We're behind. If opts.emitAllPatches then we emit immediately. Otherwise
  //    wait until we're up to date before emitting anything.

  if (upToDateVersion == null) {
    // Case 2.
    // Consume the first patch no matter what. It will usually be a snapshot.
    const patch = await patches.next()
    if (!patch.done) apply(patch.value)
  } else {
    // Cases 1 and 3
    if (!opts.emitAllPatches || version == null) {
      while (version !== upToDateVersion) {
        // Case 3.
        const patch = await patches.next()
        if (patch.done) break
        apply(patch.value)
      }
    }
  }

  async function* consumePatches() {
    for await (const patch of patches) {
      apply(patch)
      yield { value, version, patch }
    }
  }

  return {
    initialValue: value,
    initialVersion: version,
    streamHeaders,
    stream: consumePatches(),
  }
}
