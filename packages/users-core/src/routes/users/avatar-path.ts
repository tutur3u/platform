const workspaceId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isCanonicalAvatarWorkspaceId(value: string) {
  return (
    typeof value === 'string' && value.length === 36 && workspaceId.test(value)
  );
}

export function isUserAvatarFilename(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 255 &&
    /^[a-zA-Z0-9]/.test(value) &&
    !/[^a-zA-Z0-9._-]/.test(value)
  );
}

// Check original segments; decoding or URL normalization can erase traversal.
export function isUserAvatarPath(value: string, wsId: string) {
  if (!isCanonicalAvatarWorkspaceId(wsId)) return false;
  const segments = value.split('/');
  return (
    segments.length === 3 &&
    segments[0] === wsId &&
    segments[1] === 'users' &&
    isUserAvatarFilename(segments[2])
  );
}
