import { Stream } from 'ministreamiterator'
import { StringLike } from './StringLike'

export type Patch = {
  data: StringLike;
  range: string;
}
export interface StateMessage {
  /**
   * The string or buffer that we're sending to the client.
   */
  data?: StringLike // encoded patch

  /**
   * 
   */
  patches?: Array<Patch>;

  /**
   * Additional headers attached to this message when it is broadcast to clients
   */
  headers?: { [k: string]: string | any }

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

  /**
   * Note: Braid protocol doesn't currently have a "patch-type", but we're exp-
   * erimenting with it here.
   */
  patchType?: string // If missing, defaults to 'snapshot'.
}

export type BraidStream = Stream<StateMessage>
