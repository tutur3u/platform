/** Read only the current account's credential from this request's MSAL cache.
 * Never return the cache itself to a client or logs. A new MSAL instance is
 * created per OAuth exchange; its memory disappears when that request ends.
 */
export function microsoftRefreshCredential(
  serializedCache: string,
  homeAccountId: string | undefined,
  clientId: string
): string | null {
  if (!homeAccountId || !clientId) return null;
  try {
    const cache: unknown = JSON.parse(serializedCache);
    if (!cache || typeof cache !== 'object' || !('RefreshToken' in cache))
      return null;
    const entries = cache.RefreshToken;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries))
      return null;
    const matches = Object.values(entries).filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        entry.home_account_id === homeAccountId &&
        entry.client_id === clientId &&
        entry.credential_type === 'RefreshToken' &&
        typeof entry.secret === 'string' &&
        entry.secret.length > 0
    );
    return matches.length === 1 ? matches[0].secret : null;
  } catch {
    return null;
  }
}
