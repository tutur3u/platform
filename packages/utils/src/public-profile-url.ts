/** Match readable legacy usernames as well as the current canonical policy. */
export function getPublicProfilePath(username?: string | null) {
  return username && /^[a-zA-Z0-9_]{1,100}$/.test(username)
    ? `/u/${encodeURIComponent(username.toLowerCase())}`
    : null;
}

export function getPublicProfileUrl(
  username?: string | null,
  centralUrl = 'https://tuturuuu.com'
) {
  const path = getPublicProfilePath(username);
  if (!path) return null;
  try {
    const base = new URL(centralUrl);
    if (
      !['https:', 'http:'].includes(base.protocol) ||
      base.username ||
      base.password
    )
      return null;
    return new URL(path, base.origin).href;
  } catch {
    return null;
  }
}

/** An https profile image without embedded credentials, or undefined. */
export function publicProfileImage(
  value: string | null | undefined
): string | undefined {
  try {
    const url = value ? new URL(value) : null;
    return url?.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
