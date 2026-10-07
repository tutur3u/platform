import { ConnectedMailError } from './config';
import { accessToken, type ConnectedAccount } from './repository';

export async function providerRequest(
  account: ConnectedAccount,
  path: string,
  init: RequestInit = {}
) {
  const base =
    account.provider === 'google'
      ? 'https://gmail.googleapis.com/gmail/v1/users/me'
      : 'https://graph.microsoft.com/v1.0/me';
  // Only relative, app-built paths are accepted. Provider paging URLs never become arbitrary fetch targets.
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('Invalid mail provider path');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await accessToken(account)}`);
  if (account.provider === 'microsoft')
    headers.set('Prefer', 'IdType="ImmutableId"');
  let response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 401 && (!init.method || init.method === 'GET')) {
    headers.set('Authorization', `Bearer ${await accessToken(account, true)}`);
    response = await fetch(`${base}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
  }
  if (!response.ok) {
    throw new ConnectedMailError(
      response.status === 401 ? 409 : response.status === 429 ? 429 : 502,
      response.status === 401
        ? 'Reconnect this mail account'
        : 'Mail provider request failed'
    );
  }
  return response;
}
export async function providerJson(
  account: ConnectedAccount,
  path: string,
  init: RequestInit = {}
) {
  const response = await providerRequest(account, path, init);
  return response.status === 204 || response.status === 202
    ? null
    : response.json();
}
export const jsonBody = (value: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(value),
});
