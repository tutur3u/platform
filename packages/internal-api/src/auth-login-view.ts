import { getInternalApiClient, type InternalApiClientOptions } from './client';
import type { WebAccountSummary } from './auth';

/** Server-resolved login view; carries no email or token of the session. */
export interface LoginViewResponse {
  hasSession: boolean;
  providerHint: 'apple' | 'github' | 'google' | null;
  /** A registry-validated external app the sign-in returns to. */
  returnApp: { id: string; name: string } | null;
  /** Null when the device's saved accounts could not be read. */
  savedAccounts: WebAccountSummary[] | null;
  /** The id binds the displayed account to the browser session. */
  session: { avatarUrl: string | null; id: string; name: string | null } | null;
}

export interface LoginViewQuery {
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
