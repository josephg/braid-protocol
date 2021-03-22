export type RawPatch = {
  headers: Record<string, string>
  body: Uint8Array
}

export type RawSnapshotUpdate = {
  type: 'snapshot',
  headers: Record<string, string>
  value: Uint8Array
}

export type RawPatchUpdate = {
  type: 'patch',
  headers: Record<string, string>
  patches: Array<RawPatch>
}

export type RawUpdateData = RawSnapshotUpdate | RawPatchUpdate

/// ***


// A string, with autocomplete.
export type PatchType = 'braid' | 'ot-json1' | 'ot-text-unicode' | string

export type Patch<P = any> = {
  headers: Record<string, string>
  patchType: PatchType,
  range?: string,
  body: P // TODO: patch? Data? Value? ???
}

export type SnapshotUpdate<Doc = any> = {
  type: 'snapshot',
  headers: Record<string, string>
  version: string | null,
  contentType: string | null,
  value: Doc // TODO: value or data?
}

export type PatchUpdate<P = any> = {
  type: 'patch',
  headers: Record<string, string>
  version: string | null,
  patches: Array<Patch<P>>
}

export type UpdateData<Doc = any, P = any> = SnapshotUpdate<Doc> | PatchUpdate<P>
