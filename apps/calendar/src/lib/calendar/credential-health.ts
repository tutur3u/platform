import type { CalendarOAuthProvider } from './oauth-failure';
import {
  type CalendarTokenOutcome,
  type CalendarTokenOutcomeEntry,
  recordCalendarTokenOutcome,
} from './oauth-token-health';
import { providerSyncSignal } from './provider-sync-budget';
import type { CalendarSyncErrorType } from './sync-errors';
import {
  type CalendarAuthToken,
  ensureValidToken,
  type TokenRefreshResult,
} from './token-refresh';

export const MAX_TRANSIENT_RETRIES = 2;
const BASE_BACKOFF_MS = 250;

type CredentialClient = Parameters<typeof ensureValidToken>[0];

export function transientBackoffMs(retry: number, random = Math.random) {
  return Math.round(BASE_BACKOFF_MS * 4 ** (retry - 1) * (1 + random() / 2));
}

function wait(ms: number): Promise<void> {
  const signal = providerSyncSignal();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Sync error type for calendars whose credential check failed. */
export function credentialSyncErrorType(
  result: TokenRefreshResult
): CalendarSyncErrorType {
  if (result.failure?.kind === 'systemic') return 'configuration';
  // Held accounts are still rejected: the owner should reconnect them.
  return result.failure?.kind === 'permanent' ? 'auth' : 'network';
}

function outcomeOf(result: TokenRefreshResult): CalendarTokenOutcome {
  if (!result.error) return 'ok';
  if (result.fenced) return 'fenced';
  if (result.failure?.kind === 'permanent')
    // A failed quarantine write leaves the row active for the next run.
    return result.quarantine ?? 'transient';
  return result.failure?.kind === 'systemic' ? 'systemic' : 'transient';
}

/**
 * Refreshes a credential when needed. Transient failures are retried with
 * jittered backoff inside the run's budget and never deactivate; permanent
 * failures are quarantined by ensureValidToken. Logs exactly one outcome.
 */
export async function ensureHealthyCalendarCredential(
  client: CredentialClient,
  token: CalendarAuthToken,
  options: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<{
  result: TokenRefreshResult;
  outcome: CalendarTokenOutcomeEntry;
}> {
  const sleep = options.sleep ?? wait;
  let attempts = 0;
  let result: TokenRefreshResult;
  for (;;) {
    attempts += 1;
    result = await ensureValidToken(client, token);
    if (
      !result.error ||
      result.failure?.kind !== 'transient' ||
      attempts > MAX_TRANSIENT_RETRIES ||
      providerSyncSignal()?.aborted
    )
      break;
    try {
      await sleep(transientBackoffMs(attempts));
    } catch {
      break;
    }
  }
  const outcome = recordCalendarTokenOutcome({
    tokenId: token.id,
    provider: token.provider as CalendarOAuthProvider,
    outcome: outcomeOf(result),
    reason:
      result.failure?.kind === 'permanent' ? result.failure.reason : undefined,
    providerCode: result.failure?.providerCode ?? null,
    attempts,
    refreshed: !result.error && result.refreshed,
  });
  return { result, outcome };
}
