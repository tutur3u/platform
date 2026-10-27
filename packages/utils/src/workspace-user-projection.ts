const publicFields = new Set([
  'avatar_url',
  'full_name',
  'display_name',
  'group_count',
  'linked_users',
  'created_at',
  'updated_at',
]);
const privateFields = new Set([
  'email',
  'phone',
  'birthday',
  'gender',
  'ethnicity',
  'guardian',
  'national_id',
  'address',
  'note',
  'archival_note',
]);
const identityFields = new Set([
  'id',
  'ws_id',
  'archived',
  'archived_until',
  'is_guest',
]);

export interface WorkspaceUserReadAccess {
  publicInfo: boolean;
  privateInfo: boolean;
}

export function projectWorkspaceUser<T extends object>(
  profile: T,
  access: WorkspaceUserReadAccess
): Partial<T> {
  const projected: Partial<T> = { ...profile };
  for (const field in profile) {
    if (
      !identityFields.has(field) &&
      !(access.publicInfo && publicFields.has(field)) &&
      !(access.privateInfo && privateFields.has(field))
    ) {
      delete projected[field];
    }
  }
  return projected;
}
