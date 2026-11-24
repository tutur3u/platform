import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/client', () => ({ createClient: vi.fn() }));

import { PRIVACY_POLICY_VERSION } from './privacy-consent';
import { syncAnalyticsConsent } from './privacy-consent-sync';

function fakeClient({
  session = true,
  error = null as unknown,
  throws = false,
} = {}) {
  const rpc = vi.fn(async () => {
    if (throws) throw new Error('network');
    return { data: null, error };
  });
  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: session ? { user: { id: 'u' } } : null },
      })),
    },
    rpc,
  };
  return { client: client as never, rpc };
}

describe('syncAnalyticsConsent', () => {
  it('writes the choice for a signed-in visitor through the caller-bound RPC', async () => {
    const { client, rpc } = fakeClient();
    await expect(syncAnalyticsConsent(false, client)).resolves.toBe('saved');
    expect(rpc).toHaveBeenCalledWith('set_product_analytics_consent', {
      p_granted: false,
      p_source: 'web_banner',
      p_policy_version: PRIVACY_POLICY_VERSION,
    });
  });

  it('skips signed-out visitors', async () => {
    const { client, rpc } = fakeClient({ session: false });
    await expect(syncAnalyticsConsent(true, client)).resolves.toBe(
      'signed-out'
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports failures without throwing', async () => {
    expect(
      await syncAnalyticsConsent(true, fakeClient({ error: { code: '42883' } }).client)
    ).toBe('failed');
    expect(
      await syncAnalyticsConsent(true, fakeClient({ throws: true }).client)
    ).toBe('failed');
  });
});
