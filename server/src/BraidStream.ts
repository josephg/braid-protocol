import { Stream } from 'ministreamiterator'
import { StringLike } from './StringLike'

export interface StateMessage {
  /**
   * Additional headers attached to this message when it is broadcast to clients
   */
  headers?: { [k: string]: string | any }
  patchType?: string // If missing, defaults to 'snapshot'.
  data: StringLike // encoded patch

  /**
   * Version of the operation. The version must be unique to all versions in
   * this stream.
   *
   * This may be assigned by the server or by a client, depending on how braid
   * is used.
   */
  version?: string,

  /**
   * Used for dedup and client matching when version is server-assigned. (Eg in
   * OT).
   */
  patchId?: string,
}

export type BraidStream = Stream<StateMessage>
