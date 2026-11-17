// Credential values are refused before queue transport or receipt persistence.
export function tokenShaped(value) {
  if (typeof value !== 'string') return false;
  if (
    /(?:gh[pousr]_|github_pat_|vca_|vcp_|vercel_)[A-Za-z0-9_]{8,}/u.test(value)
  )
    return true;
  if (/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u.test(value))
    return true;
  return (value.match(/[A-Za-z0-9+/_=-]{32,}/gu) ?? []).some(
    (part) =>
      !/^[a-f0-9]{40}$|^[a-f0-9]{64}$/u.test(part) &&
      !/^(?:dpl|prj)_[A-Za-z0-9_]{3,100}$/u.test(part) &&
      /[a-z]/u.test(part) &&
      /[A-Z]/u.test(part) &&
      /[0-9]/u.test(part)
  );
}
export function unsafeValues(value, seen = new Set()) {
  if (typeof value === 'string') return tokenShaped(value);
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return true;
  seen.add(value);
  const unsafe = Object.values(value).some((child) =>
    unsafeValues(child, seen)
  );
  seen.delete(value);
  return unsafe;
}
