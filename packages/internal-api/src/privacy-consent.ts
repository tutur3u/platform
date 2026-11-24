import { getInternalApiClient, type InternalApiClientOptions } from './client';

export type AnalyticsConsentSource =
  | 'web_banner'
  | 'workspace_banner'
  | 'marketing_banner'
  | 'web_settings';

export interface AnalyticsConsentPayload {
  granted: boolean;
  policyVersion: string;
  source: AnalyticsConsentSource;
}

export interface AnalyticsConsentResponse {
  granted: boolean;
}

// Stores the signed-in user's cookie-banner Analytics choice, which the
// product analytics rollup honours. Signed-out callers get a 401.
export async function setCurrentUserAnalyticsConsent(
  payload: AnalyticsConsentPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AnalyticsConsentResponse>(
    '/api/v1/users/me/analytics-consent',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    }
  );
}
