export function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
export function publicEvidenceUrl(
  value: string,
  host: 'github.com' | 'tuturuuu.com'
): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.host !== host ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Require an absolute HTTPS public evidence URL at its expected host'
    );
  }
  const segments = url.pathname.split('/').slice(1);
  const canonical = segments
    .map((segment, index) => {
      const decoded = decodeURIComponent(segment);
      if (
        (!decoded && index !== segments.length - 1) ||
        decoded === '.' ||
        decoded === '..' ||
        /[/\\\x00-\x20\x7f]/.test(decoded)
      ) {
        throw new Error('Invalid public evidence path segment');
      }
      return encodePathSegment(decoded);
    })
    .join('/');
  if (value !== `https://${host}/${canonical}`)
    throw new Error('Public evidence URL is not canonically encoded');
  return url;
}
export function githubSourceUrl(commit: string, path: string): string {
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw new Error('Invalid immutable source identity');
  const value = `https://github.com/tutur3u/platform/blob/${commit}/${path.split('/').map(encodePathSegment).join('/')}`;
  publicEvidenceUrl(value, 'github.com');
  return value;
}
