import { InternalApiError } from '@tuturuuu/internal-api/client';
import { describe, expect, it, vi } from 'vitest';
import { PRIVACY_POLICY_VERSION } from './privacy-consent';
import {
  reconcileAnalyticsWithdrawal,
  recordAnalyticsChoiceSync,
  syncAnalyticsConsent,
} from './privacy-consent-sync';

const store = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
};

describe('syncAnalyticsConsent', () => {
  it('writes the choice through the Web API with this banner as the source', async () => {
    const write = vi.fn(async () => ({ granted: false }));
    await expect(syncAnalyticsConsent(false, write)).resolves.toBe('saved');
    expect(write).toHaveBeenCalledWith({
      granted: false,
      policyVersion: PRIVACY_POLICY_VERSION,
      source: 'web_banner',
    });
  });

  it('treats 401 and 403 as signed out and anything else as a failure', async () => {
    const reject = (error: unknown) => vi.fn(async () => Promise.reject(error));
    expect(
      await syncAnalyticsConsent(true, reject(new InternalApiError('x', 401)))
    ).toBe('signed-out');
    expect(
      await syncAnalyticsConsent(true, reject(new InternalApiError('x', 403)))
    ).toBe('signed-out');
    expect(
      await syncAnalyticsConsent(true, reject(new InternalApiError('x', 500)))
    ).toBe('failed');
    expect(await syncAnalyticsConsent(true, reject(new Error('net')))).toBe(
      'failed'
    );
  });
});

describe('reconcileAnalyticsWithdrawal', () => {
  it('re-sends a withdrawal once per session after it is saved', async () => {
    const s = store();
    const write = vi.fn(async () => ({ granted: false }));
    expect(await reconcileAnalyticsWithdrawal({ store: s, write })).toBe(
      'saved'
    );
    expect(await reconcileAnalyticsWithdrawal({ store: s, write })).toBe(
      'skipped'
    );
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ granted: false })
    );
  });

  it('retries a signed-out withdrawal after ten minutes, and a failure at once', async () => {
    const s = store();
    const signedOut = vi.fn(async () =>
      Promise.reject(new InternalApiError('x', 401))
    );
    expect(
      await reconcileAnalyticsWithdrawal({ store: s, now: 0, write: signedOut })
    ).toBe('signed-out');
    expect(
      await reconcileAnalyticsWithdrawal({
        store: s,
        now: 60_000,
        write: signedOut,
      })
    ).toBe('skipped');
    const ok = vi.fn(async () => ({ granted: false }));
    expect(
      await reconcileAnalyticsWithdrawal({ store: s, now: 600_001, write: ok })
    ).toBe('saved');

    const t = store();
    const failing = vi.fn(async () => Promise.reject(new Error('net')));
    expect(
      await reconcileAnalyticsWithdrawal({ store: t, write: failing })
    ).toBe('failed');
    expect(await reconcileAnalyticsWithdrawal({ store: t, write: ok })).toBe(
      'saved'
    );
  });
});

describe('recordAnalyticsChoiceSync', () => {
  it('re-arms reconciliation after a grant or an unsynced withdrawal', async () => {
    const s = store();
    const ok = vi.fn(async () => ({ granted: false }));
    expect(await reconcileAnalyticsWithdrawal({ store: s, write: ok })).toBe(
      'saved'
    );
    recordAnalyticsChoiceSync(s, true, 'saved');
    recordAnalyticsChoiceSync(s, false, 'failed');
    expect(await reconcileAnalyticsWithdrawal({ store: s, write: ok })).toBe(
      'saved'
    );
    recordAnalyticsChoiceSync(s, false, 'saved');
    expect(await reconcileAnalyticsWithdrawal({ store: s, write: ok })).toBe(
      'skipped'
    );
  });
});
