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
  headers?: { [k: string]: string | any }


  /**
   * Note: Braid protocol doesn't currently have a "patch-type", but we're exp-
   * erimenting with it here.
   */
}

export type SnapshotUpdate = CommonUpdate & {
  /** The encoded contents of the new document snapshot */
  value: StringOrBuf
}

export type Patch = {
  /** Defaults to the patch type of the stream. At least one or the other must be set. */
  patchType?: string
  /** Used for braid patches. Implies patchType = 'braid' */
  range?: string
  data: StringOrBuf
}

export type PatchUpdate = CommonUpdate & {
  patches: Array<Patch>
}

export type Update = SnapshotUpdate | PatchUpdate
export type BraidStream = Stream<Update>
