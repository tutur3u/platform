import { createClient } from '@tuturuuu/supabase/next/client';
import { PRIVACY_POLICY_VERSION } from './privacy-consent';

export type AnalyticsConsentSyncResult = 'saved' | 'signed-out' | 'failed';

// Stores a signed-in visitor's Analytics choice server-side, where the
// observability-product-analytics rollup reads it. The browser record stays
// authoritative for this device; a failure leaves the server at its previous
// decision, and with no decision the rollup does not count the person.
export async function syncAnalyticsConsent(
  granted: boolean,
  client: Pick<ReturnType<typeof createClient>, 'auth' | 'rpc'> = createClient()
): Promise<AnalyticsConsentSyncResult> {
  try {
    const { data } = await client.auth.getSession();
    if (!data.session) return 'signed-out';
    const { error } = await client.rpc('set_product_analytics_consent', {
      p_granted: granted,
      p_source: 'web_banner',
      p_policy_version: PRIVACY_POLICY_VERSION,
    });
    return error ? 'failed' : 'saved';
  } catch {
    return 'failed';
  }
}
