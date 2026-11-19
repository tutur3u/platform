export interface DocumentOwner {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

export function documentColumns(hierarchyEnabled: boolean) {
  const columns =
    'id, name, content, is_public, created_at, updated_at, owner_id';
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
