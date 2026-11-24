import { InternalApiError } from '@tuturuuu/internal-api/client';
import { setCurrentUserAnalyticsConsent } from '@tuturuuu/internal-api/privacy-consent';
import { PRIVACY_POLICY_VERSION } from './privacy-consent';

export type AnalyticsConsentSyncResult = 'saved' | 'signed-out' | 'failed';

export const ANALYTICS_CONSENT_SOURCE = 'workspace_banner';
const RECONCILE_KEY = 'tuturuuu:privacy-consent-withdrawal-sync';
const SIGNED_OUT_RETRY_MS = 10 * 60 * 1000;

type Write = typeof setCurrentUserAnalyticsConsent;

// Stores a signed-in visitor's Analytics choice on the account (through the
// Web API, which this app proxies), where the product analytics rollup reads
// it. Under the default 'consent' basis a person with no stored grant is not
// counted, so a failure can only leave a withdrawal unsynced; callers surface
// that and reconcile it later.
export async function syncAnalyticsConsent(
  granted: boolean,
  write: Write = setCurrentUserAnalyticsConsent
): Promise<AnalyticsConsentSyncResult> {
  try {
    await write({
      granted,
      policyVersion: PRIVACY_POLICY_VERSION,
      source: ANALYTICS_CONSENT_SOURCE,
    });
    return 'saved';
  } catch (error) {
    if (
      error instanceof InternalApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      return 'signed-out';
    }
    return 'failed';
  }
}

interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Re-sends a withdrawal stored in this browser at most once per browser
// session (or every 10 minutes while signed out), so a withdrawal made while
// signed out, or whose sync failed, reaches the account after sign-in. Grants
// are never replayed: a shared browser must not grant for another account.
export async function reconcileAnalyticsWithdrawal({
  store,
  now = Date.now(),
  write,
}: {
  store: SessionStore | null;
  now?: number;
  write?: Write;
}): Promise<AnalyticsConsentSyncResult | 'skipped'> {
  try {
    const last = store?.getItem(RECONCILE_KEY);
    if (last === `${PRIVACY_POLICY_VERSION}:saved`) return 'skipped';
    const signedOutAt = last?.startsWith(
      `${PRIVACY_POLICY_VERSION}:signed-out:`
    )
      ? Number(last.split(':').at(-1))
      : Number.NaN;
    if (now - signedOutAt < SIGNED_OUT_RETRY_MS) return 'skipped';
    const result = await syncAnalyticsConsent(false, write);
    if (result === 'saved') {
      store?.setItem(RECONCILE_KEY, `${PRIVACY_POLICY_VERSION}:saved`);
    } else if (result === 'signed-out') {
      store?.setItem(
        RECONCILE_KEY,
        `${PRIVACY_POLICY_VERSION}:signed-out:${now}`
      );
    }
    return result;
  } catch {
    return 'failed';
  }
}

// Keeps the reconcile marker in step with choices made in this session: a
// synced withdrawal marks it done; a grant, or a withdrawal that did not
// reach the account, clears it so the next page load re-sends the latest
// withdrawal.
export function recordAnalyticsChoiceSync(
  store: SessionStore | null,
  granted: boolean,
  result: AnalyticsConsentSyncResult
) {
  try {
    if (!granted && result === 'saved') {
      store?.setItem(RECONCILE_KEY, `${PRIVACY_POLICY_VERSION}:saved`);
    } else {
      store?.removeItem(RECONCILE_KEY);
    }
  } catch {
    // Storage may be unavailable; the next mount re-sends the withdrawal.
  }
}
