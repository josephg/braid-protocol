import { Stream } from 'ministreamiterator'
import { StringLike } from './StringLike'

export interface StateMessage {
  headers?: { [k: string]: string | any }
  patchType?: string // If missing, defaults to 'snapshot'.
  data: StringLike // encoded patch
  version?: string
}

export type BraidStream = Stream<StateMessage>
