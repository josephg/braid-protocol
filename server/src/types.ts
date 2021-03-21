import { Stream } from 'ministreamiterator'

export type StringOrBuf = string | Buffer | Uint8Array

// export function toBuf(data: StringLike): Buffer {
//   return typeof data === 'string' ? Buffer.from(data, 'utf8') : data
// }

type CommonUpdate = {
  /**
   * Version of the operation. The version must be unique to all versions in
   * this stream.
   *
   * This may be assigned by the server or by a client, depending on how braid
   * is used.
   */
  version?: string

  /**
   * Used for dedup and client matching when version is server-assigned. (Eg in
   * OT). Not in the spec.
   */
  patchId?: string

  /**
   * Additional headers attached to this message when it is broadcast to clients
   */
  headers?: Record<string, string>
}

export type SnapshotUpdate = CommonUpdate & {
  /** The encoded contents of the new document snapshot */
  value: StringOrBuf
}

export type Patch = {
  headers?: Record<string, string>
  /** Defaults to the patch type of the stream. At least one or the other must be set. */
  patchType?: string
  /** Used for braid patches. Implies patchType = 'braid' */
  range?: string
  data: StringOrBuf
}

export type PatchUpdate = CommonUpdate & {
  // The patches can just be specified as strings / buffers instead of
  // full patch objects, if the patch type is specified at the top
  // level.
  patches: Array<Patch | StringOrBuf>
}

export type Update = SnapshotUpdate | PatchUpdate
export type BraidStream = Stream<Update>
