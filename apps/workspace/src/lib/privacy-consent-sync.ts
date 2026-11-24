export type AnalyticsConsentSyncResult = 'saved' | 'signed-out' | 'failed';

// This app has no Supabase session of its own, so the Analytics choice stays
// in this browser only. The server-side record behind the product analytics
// rollup is written from the Web app's banner (apps/web); under the default
// 'consent' basis a person with no server decision is not counted.
export async function syncAnalyticsConsent(
  _granted: boolean
): Promise<AnalyticsConsentSyncResult> {
  return 'signed-out';
}
