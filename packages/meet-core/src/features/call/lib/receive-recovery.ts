/**
 * Automatic recovery for incoming media that stopped arriving. The receiving
 * peer is rebuilt on a backoff schedule and the attempts are capped, so a
 * persistent failure never turns into a tight session churn loop. Past the
 * cap the room shows a quiet status and retries again only when the browser
 * reports the network came back, or media flows again.
 */
export const RECEIVE_RETRY_DELAYS_MS = [0, 10_000, 30_000, 60_000, 120_000];
export const RECEIVE_RETRY_CAP = RECEIVE_RETRY_DELAYS_MS.length;
/** Continuous health that clears the attempt count and any status. */
export const RECEIVE_HEALTHY_RESET_MS = 30_000;

export type ReceiveStatus = 'ok' | 'unavailable';

export function createReceiveRecovery({
  rebuild,
  onStatus,
  clock = Date.now,
}: {
  rebuild: () => void;
  onStatus: (status: ReceiveStatus) => void;
  clock?: () => number;
}) {
  let attempts = 0;
  let lastAttemptAt = -Infinity;
  let healthySince: number | null = null;
  let status: ReceiveStatus = 'ok';
  const publish = (next: ReceiveStatus) => {
    if (next === status) return;
    status = next;
    onStatus(next);
  };
  const reset = () => {
    attempts = 0;
    lastAttemptAt = -Infinity;
    healthySince = null;
    publish('ok');
  };
  return {
    /** The health check found media that should be flowing but is not. */
    stalled() {
      healthySince = null;
      if (attempts >= RECEIVE_RETRY_CAP) {
        publish('unavailable');
        return;
      }
      const now = clock();
      if (now - lastAttemptAt < (RECEIVE_RETRY_DELAYS_MS[attempts] ?? 0))
        return;
      attempts++;
      lastAttemptAt = now;
      rebuild();
    },
    /** The health check found nothing wrong. */
    healthy() {
      const now = clock();
      healthySince ??= now;
      if (now - healthySince >= RECEIVE_HEALTHY_RESET_MS) reset();
    },
    /** The browser reports connectivity again: earn a fresh set of attempts. */
    retryNow: reset,
    attempts: () => attempts,
  };
}
export type ReceiveRecovery = ReturnType<typeof createReceiveRecovery>;
