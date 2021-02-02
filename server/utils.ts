import { ServerResponse } from 'http'
import { StringLike } from './StringLike'

export function writeHeaders(
  stream: ServerResponse,
  headers: Record<string, string>
) {
  stream.write(
    Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}\r\n`)
      .join('') + '\r\n'
  )
}

export function toBuf(data: StringLike): Buffer {
  return typeof data === 'string' ? Buffer.from(data, 'utf8') : data
}
