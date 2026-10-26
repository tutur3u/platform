import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import { createFakeCalendarOAuthNonceLedger } from './calendar-oauth-nonce-ledger.test-utils';
import {
  admitGoogleConsentRestart,
  CONSENT_RESTART_WINDOW_MS,
} from './google-consent-restart';

afterEach(() => vi.restoreAllMocks());
const T0 = Date.UTC(2026, 9, 26, 8, 1);
const input = {
  userId: 'user-a',
  wsId: 'workspace-a',
  account: 'provider-account-a',
  clientSecret: 'test-only-client-secret',
  now: T0,
};

describe('Google automatic consent restart admission', () => {
  it('admits only one concurrent restart and caps newly initiated flows for that account', async () => {
    const ledger = createFakeCalendarOAuthNonceLedger();
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        admitGoogleConsentRestart({ ...input, client: ledger.client })
      )
    );
    expect(attempts.filter((result) => result.kind === 'allowed')).toHaveLength(
      1
    );
    expect(attempts.filter((result) => result.kind === 'limited')).toHaveLength(
      4
    );
    expect(
      await admitGoogleConsentRestart({
        ...input,
        now: T0 + 60_000,
        client: ledger.client,
      })
    ).toEqual({ kind: 'limited', retryAfterSeconds: 480 });
    expect(ledger.calls.every(({ args }) => args.p_nonce.length === 64)).toBe(
      true
    );
    expect(JSON.stringify(ledger.calls)).not.toContain(input.account);
    expect(JSON.stringify(ledger.calls)).not.toContain(input.clientSecret);
  });

  it('isolates account, user and workspace and admits the next window', async () => {
    const ledger = createFakeCalendarOAuthNonceLedger();
    const call = (extra: Partial<typeof input>) =>
      admitGoogleConsentRestart({ ...input, ...extra, client: ledger.client });
    expect((await call({})).kind).toBe('allowed');
    expect((await call({ account: 'provider-account-b' })).kind).toBe(
      'allowed'
    );
    expect((await call({ userId: 'user-b' })).kind).toBe('allowed');
    expect((await call({ wsId: 'workspace-b' })).kind).toBe('allowed');
    expect((await call({ now: T0 + CONSENT_RESTART_WINDOW_MS })).kind).toBe(
      'allowed'
    );
    for (const { args } of ledger.calls)
      expect(Date.parse(args.p_expires_at) - T0).toBeLessThanOrEqual(
        2 * CONSENT_RESTART_WINDOW_MS
      );
  });

  it('fails closed if the durable ledger cannot answer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ledger = createFakeCalendarOAuthNonceLedger();
    ledger.failure = { code: 'PGRST202', message: 'test unavailable' };
    expect(
      await admitGoogleConsentRestart({ ...input, client: ledger.client })
    ).toEqual({ kind: 'unavailable', retryAfterSeconds: 540 });
  });
});
