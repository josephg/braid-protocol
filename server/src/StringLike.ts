// TODO: Should probably allow ArrayBuffer too.
export type StringLike = string | Buffer

export function toBuf(data: StringLike): Buffer {
  return typeof data === 'string' ? Buffer.from(data, 'utf8') : data
}
