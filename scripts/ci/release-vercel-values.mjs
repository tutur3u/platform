// Credential values are refused before queue transport or receipt persistence.
const digestFields = new Set([
  'sourceSha',
  'recipeSha256',
  'configSha256',
  'artifactSha256',
  'evidenceSha256',
  'lifecycleSha256',
  'predecessorSha256',
  'aliasLockKey',
]);
export function tokenShaped(value) {
  if (typeof value !== 'string') return false;
  if (
    /(?:gh[pousr]_|github_pat_|vca_|vcp_|vercel_)[A-Za-z0-9_]{8,}/u.test(value)
  )
    return true;
  if (/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u.test(value))
    return true;
  if (/^(?:dpl|prj)_[A-Za-z0-9_]{3,100}$/u.test(value)) return false;
  return /[A-Za-z0-9+/=]{32,}/u.test(value);
}
export function unsafeValues(value, seen = new Set(), field = '') {
  if (typeof value === 'string') {
    if (
      digestFields.has(field) &&
      /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value)
    )
      return false;
    return tokenShaped(value);
  }
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return true;
  seen.add(value);
  const unsafe = Object.entries(value).some(([key, child]) =>
    unsafeValues(child, seen, key)
  );
  seen.delete(value);
  return unsafe;
}
