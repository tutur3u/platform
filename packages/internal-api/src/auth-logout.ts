import type { BrowserSessionLogoutResponse } from './auth';
import { getInternalApiClient, type InternalApiClientOptions } from './client';

export function logoutBrowserSessionWithInternalApi(
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<BrowserSessionLogoutResponse>(
    '/api/auth/logout',
    {
      cache: 'no-store',
      credentials: 'include',
      method: 'POST',
    }
  );
}

export function logoutSatelliteAppWithInternalApi(
  options: InternalApiClientOptions & { baseUrl: string }
) {
  return logoutBrowserSessionWithInternalApi(options);
}
