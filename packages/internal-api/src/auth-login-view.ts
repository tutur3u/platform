import { getInternalApiClient, type InternalApiClientOptions } from './client';
import type { WebAccountSummary } from './auth';

/** Server-resolved login view; carries no email or token of the session. */
export interface LoginViewResponse {
  hasSession: boolean;
  /**
   * `unknown` when the server could not read the session. Only `absent` may
   * let a provider start without a click.
   */
  sessionStatus: 'absent' | 'present' | 'unknown';
  providerHint: 'apple' | 'github' | 'google' | null;
  /**
   * A registry-validated external app the sign-in returns to. `autoContinue`
   * is true only for a strict PKCE registration with a valid S256 challenge
   * on the request; an existing session may then continue without a click.
   */
  returnApp: { autoContinue: boolean; id: string; name: string } | null;
  /** Null when the device's saved accounts could not be read. */
  savedAccounts: WebAccountSummary[] | null;
  /** The id binds the displayed account to the browser session. */
  session: { avatarUrl: string | null; id: string; name: string | null } | null;
}

export interface LoginViewQuery {
  codeChallenge?: string | null;
  codeChallengeMethod?: string | null;
  provider?: string | null;
  returnUrl?: string | null;
}

export async function getLoginViewWithInternalApi(
  query: LoginViewQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const params = new URLSearchParams();
  if (query.provider) params.set('provider', query.provider);
  if (query.returnUrl) params.set('returnUrl', query.returnUrl);
  if (query.codeChallenge) params.set('code_challenge', query.codeChallenge);
  if (query.codeChallengeMethod) {
    params.set('code_challenge_method', query.codeChallengeMethod);
  }
  const search = params.toString();
  const response = await client.fetch(
    `/api/v1/auth/login-view${search ? `?${search}` : ''}`,
    { cache: 'no-store', method: 'GET' }
  );
  if (!response.ok) {
    throw new Error(`Login view request failed: ${response.status}`);
  }
  return (await response.json()) as LoginViewResponse;
}
