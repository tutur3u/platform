import { unseal } from './crypto';
import type { ConnectedAccount, Credentials } from './repository';

export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const REVOKE_TIMEOUT_MS = 5000;

/**
 * Revokes the app's provider grant for a connected account before its stored
 * credentials are deleted. Failures never throw: the caller still deletes the
 * stored tokens, and the result only reports whether the provider confirmed it.
 *
 * Microsoft has no app-scoped revocation endpoint (Graph revokeSignInSessions
 * signs the user out of every app), so deleting the stored tokens is the
 * revocation. Users can remove consent at https://account.live.com/consent/Manage
 * or https://myapps.microsoft.com.
 */
export async function revokeProviderAccess(
  account: Pick<
    ConnectedAccount,
    'id' | 'provider' | 'user_id' | 'credentials'
  >,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (account.provider === 'microsoft') return true;
  let token: string | undefined;
  try {
    const credentials = unseal<Partial<Credentials>>(
      account.credentials,
      account.user_id
    );
    token = credentials?.refreshToken || credentials?.accessToken;
  } catch {
    console.warn('Mail disconnect could not read stored credentials', {
      accountId: account.id,
      provider: account.provider,
    });
    return false;
  }
  if (typeof token !== 'string' || !token) {
    console.warn('Mail disconnect found no stored token to revoke', {
      accountId: account.id,
      provider: account.provider,
    });
    return false;
  }
  try {
    const response = await fetchImpl(GOOGLE_REVOKE_URL, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    await response.body?.cancel();
    if (response.ok) return true;
    console.warn('Mail provider token revocation was rejected', {
      accountId: account.id,
      provider: account.provider,
      status: response.status,
    });
    return false;
  } catch (error) {
    console.warn('Mail provider token revocation failed', {
      accountId: account.id,
      provider: account.provider,
      error: error instanceof Error ? error.name : 'UnknownError',
    });
    return false;
  }
}
