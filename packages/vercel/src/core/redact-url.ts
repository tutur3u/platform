/** Query parameters that can carry live credentials (cross-app tokens, OAuth). */
export const SENSITIVE_URL_PARAMS = [
  'token',
  'code',
  'access_token',
  'refresh_token',
  'id_token',
] as const;

/**
 * Masks credential-bearing query values and drops a fragment that carries
 * parameters (OAuth implicit flows), so analytics never stores a live token.
 * Other URLs are returned unchanged; unparseable input is returned as is.
 */
export function redactSensitiveUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  let changed = false;
  for (const name of SENSITIVE_URL_PARAMS) {
    if (!parsed.searchParams.has(name)) continue;
    parsed.searchParams.set(name, 'redacted');
    changed = true;
  }
  if (parsed.hash.includes('=')) {
    parsed.hash = '';
    changed = true;
  }
  return changed ? parsed.toString() : url;
}
