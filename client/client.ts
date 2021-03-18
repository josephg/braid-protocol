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

type RawPatch = {
  headers: Record<string, string>
  data: Uint8Array
}

type RawSnapshotUpdate = {
  type: 'snapshot',
  headers: Record<string, string>
  data: Uint8Array
}

type RawPatchUpdate = {
  type: 'patch',
  headers: Record<string, string>
  patches: Array<RawPatch>
}

type RawUpdateData = RawSnapshotUpdate | RawPatchUpdate

// Reused. (Why is this a stateful API?)
const decoder = new TextDecoder()

async function* readHTTPChunks(res: Response): AsyncGenerator<RawUpdateData> {
  // Medium-sized state machine. We swap back and forth from reading the headers <->
  // reading data. Every chunk must contain a content-length field. If we encounter
  // a Patches header, we count out the patches (each with headers & content) and return
  // them inside a version.

  // An alternate implementation here could make another generator and
  // lean on the compiler-generated generator's state machine.

  const enum State {
    UpdateHeaders,
    UpdateContent,
    PatchHeaders,
    PatchContent,
  }
  let state = State.UpdateHeaders
  let buffer = new Uint8Array()
  let versionHeaders: Record<string, string> | null = null
  let patchHeaders: Record<string, string> | null = null
  let patches: Array<RawPatch> = []
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

  function* append(s: Uint8Array): Generator<RawUpdateData> {
    // This is pretty inefficient, but it's probably fine.
    buffer = concatBuffers(buffer, s)

    while (true) {
      // console.log('while', state, buffer.length, asciiDecoder.decode(buffer))
      // Read as much as we can.
      if (state == State.UpdateHeaders) {
        const nextHeaders = getNextHeaders()
        if (nextHeaders == null) break // need more bytes

        versionHeaders = nextHeaders
        if (versionHeaders['patches']) {
          patchesCount = parseInt(versionHeaders['patches'], 10)
          state = State.PatchHeaders
        } else {
          state = State.UpdateContent
        }
      } else if (state == State.UpdateContent) {
        if (versionHeaders == null) throw Error('invalid state')

        const contentLength = versionHeaders['content-length']
        if (contentLength == null) throw Error('Content-Length or Patches required')

        const contentLengthNum = parseInt(contentLength)
        if (isNaN(contentLengthNum) || contentLengthNum < 0) {
          throw Error('invalid Content-Length')
        }

        if (buffer.length < contentLengthNum) break // need more bytes

        const data = buffer.slice(0, contentLengthNum)
        yield {
          type: 'snapshot',
          headers: versionHeaders,
          data
        }
        buffer = buffer.slice(contentLengthNum)
        versionHeaders = null
        state = State.UpdateHeaders
      } else if (state == State.PatchHeaders) {
        if (versionHeaders == null) throw Error('invalid state')

        patchHeaders = getNextHeaders()
        if (patchHeaders == null) break // need more bytes
        state = State.PatchContent
      } else if (state == State.PatchContent) {
        if (versionHeaders == null) throw Error('invalid state')
        if (patchHeaders == null) throw Error('invalid state')

        const contentLength = patchHeaders['content-length']
        if (contentLength == null) {
          throw Error('Patch is missing Content-Length header')
        }

        const contentLengthNum = parseInt(contentLength)
        if (isNaN(contentLengthNum) || contentLengthNum < 0) {
          throw Error('invalid Content-Length')
        }

        if (buffer.length < contentLengthNum) break // more bytes plz

        const data = buffer.slice(0, contentLengthNum)

        // We don't yield yet, because we need all the patches for this
        // version together. Push onto array and send later.
        patches.push({ headers: patchHeaders, data })
        buffer = buffer.slice(contentLengthNum)
        patchHeaders = null

        // One fewer patches in this version to process
        patchesCount--

        if (patchesCount == 0) {
          yield {
            type: 'patch',
            headers: versionHeaders,
            patches
          }
          state = State.UpdateHeaders
          patches = []
          versionHeaders = null
          patchHeaders = null
        } else {
          // Go back to processing next patch (or done)
          state = State.PatchHeaders
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

export interface RawSubscribeOpts {
  reqHeaders?: Record<string, string>
}

export async function subscribeRaw(url: string, opts: RawSubscribeOpts = {}) {
  const res = await fetch(url, {
    // url,
    headers: {
      subscribe: 'keep-alive',
      ...opts.reqHeaders,
    },
  })

  return {
    streamHeaders: Object.fromEntries(res.headers),
    updates: readHTTPChunks(res),
  }
}

// ***** TODO: API boundary here.

// A string, with autocomplete.
type PatchType = 'braid' | 'ot-json1' | 'ot-text-unicode' | string

type ParsedPatch<Patch = any> = {
  headers: Record<string, string>
  type: PatchType,
  patch: Patch // TODO: patch? Data? Value? ???
}

type SnapshotUpdate<Doc = any> = {
  type: 'snapshot',
  headers: Record<string, string>
  version: string | null,
  contentType: string,
  value: Doc // TODO: value or data?
}

type PatchUpdate<Patch = any> = {
  type: 'patch',
  headers: Record<string, string>
  version: string | null,
  patches: Array<ParsedPatch<Patch>>
}

type UpdateData<Doc = any, Patch = any> = SnapshotUpdate<Doc> | PatchUpdate<Patch>


const defaultParseDoc = (contentType: string, content: Uint8Array): any => (
  // This is vastly incomplete and a compatibility nightmare.
  contentType.startsWith('text/') ? decoder.decode(content)
  : contentType.startsWith('application/json') ? JSON.parse(decoder.decode(content))
  : content
)

const defaultParsePatch = (patchType: string, headers: Record<string, string>, data: Uint8Array): any => (
  // This is woefully wrong. Amongst other things, this needs to handle
  // braid patches.
  JSON.parse(decoder.decode(data))
)

interface SubscribeOpts<Doc = any, Patch = any> extends RawSubscribeOpts {
  parseDoc?: (contentType: string, content: Uint8Array) => Doc
  parsePatch?: (patchType: string, headers: Record<string, string>, content: Uint8Array) => Patch
}

/**
 * This is a variant of subscribeRaw which (roughly) parses converts
 * patch / snapshot based on the content-type header in the parent
 * response. This may or may not actually be correct according to the
 * protocol...
 */
export async function subscribe<Doc = any, Patch = any>(url: string, opts: SubscribeOpts<Doc, Patch> = {}) {
  const { streamHeaders, updates: updateStream } = await subscribeRaw(url, opts)
  const contentType = streamHeaders['content-type']
  // Assuming https://github.com/braid-org/braid-spec/issues/106 is accepted
  const patchType = streamHeaders['patch-type']
  const currentVersions: string = streamHeaders['current-versions'] ?? null
  const parsePatch = opts.parsePatch ?? defaultParsePatch
  const parseDoc = opts.parseDoc ?? defaultParseDoc

  async function* consumeVersions(): AsyncGenerator<UpdateData<Doc, Patch>> {
    for await (const update of updateStream) {
      const {headers} = update
      if (update.type === 'snapshot') {
        const data = update.data
        const value = parseDoc(contentType, data)
        yield {
          type: 'snapshot',
          headers,
          version: headers['version'] ?? null,
          contentType: contentType,
          value,
        }
      } else {
        const patches = update.patches.map(patch => {
          // patch-type header is defined in https://github.com/braid-org/braid-spec/issues/97 .
          const localPatchType = patch.headers['content-type']
            ?? patch.headers['patch-type']
            ?? (patch.headers['content-range'] ? 'braid' : null)
            ?? patchType
            ?? 'unknown'

          // console.log('got patch content', patch.data, `'${decoder.decode(patch.data)}'`)
          return {
            headers: patch.headers,
            type: localPatchType,
            patch: parsePatch(contentType, patch.headers, patch.data),
          } as ParsedPatch<Patch>
        })
        yield {
          type: 'patch',
          headers,
          version: headers['version'] ?? null,
          patches,
        }
      }
    }
  }

  return {
    streamHeaders,
    currentVersions,
    contentType,
    updates: consumeVersions(),
  }
}

export interface StateClientOptions<Doc = any> extends RawSubscribeOpts {
  parseDoc?: (contentType: string, content: Uint8Array) => Doc
  applyPatch?: (prevValue: Doc, patchType: string, patch: Uint8Array) => Doc

  /**
   * If the client knows the value of the document at some specified version,
   * set knownDoc and knownAtVersion. The server can elide intervening
   * operations and just bring the client up to date.
   */
  knownDoc?: Doc
  knownAtVersion?: string

  /**
   * If knownAtVersion is behind the current server version, emit all
   * intermediate operations in the iterator. Do not wait until the client is
   * up-to-date before returning.
   *
   * Has no effect if knownAtVersion is unset.
   */
  emitAllPatches?: boolean,

  /** Should the client automatically reconnect when disconnected? */
  // reconnect?: boolean
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


/**
 * This is a high level API for subscribe. It supports:
 *
 * - Tracking the state of the document over time
 * - Reconnecting (well, it will)
 * - Waiting for the initial document verion before returning
 */
export async function subscribeFancy<Doc = any>(
  url: string,
  opts: StateClientOptions<Doc> = {}
) {
  // type PatchBundle = {
  //   patchType: string,
  //   headers: Record<string, string>,
  //   content: Uint8Array
  // }
  let value: any = opts.knownDoc
  let version: string | null = opts.knownAtVersion ?? null

  const reqHeaders: Record<string, string> = {}
  if (opts.knownAtVersion != null) reqHeaders['version'] = opts.knownAtVersion

  const { streamHeaders, currentVersions, updates: updateStream } = await subscribe(url, {
    reqHeaders: opts.reqHeaders,
    parseDoc: opts.parseDoc,
    parsePatch: (patchType, headers, content) => content
  })
  // const contentType = streamHeaders['content-type']
  // const upToDateVersion: string | null = streamHeaders['current-versions'] ?? null
  // const patchType = streamHeaders['patch-type']

  const apply = (update: UpdateData<Doc, Uint8Array>) => {
    if (update.version != null) version = update.version

    if (update.type === 'snapshot') {
      value = update.value
    } else {
      if (!opts.applyPatch) {
        throw Error('Cannot patch documents without an apply function')
      }

      for (const patch of update.patches) {
        value = opts.applyPatch(value, patch.type, patch.patch)
      }
    }
  }

  // This method will wait until we have the first known-good value before
  // returning. There's three cases when this happens. Either:
  //
  // 1. The client already knows the value at the current version
  //    (currentVersions === knownAtVersion).
  // 2. There is no known version. The first message from the server should have
  //    a snapshot. Return that.
  // 3. We're behind. If opts.emitAllPatches then we emit immediately. Otherwise
  //    wait until we're up to date before emitting anything.

  if (currentVersions == null) {
    // Case 2.
    // Consume the first patch no matter what. It will usually be a snapshot.
    const update = await updateStream.next()
    if (!update.done) apply(update.value)
  } else {
    // Cases 1 and 3
    if (!opts.emitAllPatches || version == null) {
      while (version !== currentVersions) {
        // Case 3.
        const update = await updateStream.next()
        if (update.done) break
        apply(update.value)
      }
    } // else case 1.
  }

  async function* consumePatches() {
    for await (const update of updateStream) {
      apply(update)
      yield { value, version, update }
    }
  }

  return {
    initialValue: value,
    initialVersion: version,
    streamHeaders,
    updates: consumePatches(),
  }
}
