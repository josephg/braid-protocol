
import { RawSubscribeOpts, subscribe as subscribeInner, UpdateData } from '@josephg/braid-client-raw'

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
 export async function subscribe<Doc = any>(
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

  const { streamHeaders, currentVersions, updates: updateStream } = await subscribeInner(url, {
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
        value = opts.applyPatch(value, patch.patchType, patch.body)
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
