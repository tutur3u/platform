export interface DocumentOwner {
  user_id: string;
  full_name: string | null;
}

/** Row shape for a dynamic documents select. The query string is not a literal. */
export interface WorkspaceDocumentRow {
  id: string;
  name: string | null;
  content: unknown;
  is_public: boolean | null;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
  parent_id?: string | null;
  position?: number | null;
}

export function documentColumns(
  hierarchyEnabled: boolean,
  includeMetadata = true
) {
  const base = 'id, name, content, is_public, created_at';
  const columns = includeMetadata ? `${base}, updated_at, owner_id` : base;
  return hierarchyEnabled ? `${columns}, parent_id, position` : columns;
}

export function attachDocumentOwner<T extends { owner_id: string | null }>(
  row: T,
  owners: DocumentOwner[],
  viewerId: string
) {
  const owner = row.owner_id
    ? (owners.find((candidate) => candidate.user_id === row.owner_id) ?? null)
    : null;
  return {
    ...row,
    owner,
    owner_is_viewer: row.owner_id != null && row.owner_id === viewerId,
  };
}
