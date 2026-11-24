/**
 * Per-isolate operation counters (G17). Each isolate counts operations per
 * accounting category and flushes them to `SessionBudget` at most once every
 * 60 seconds. A failed flush is dropped and counted, and never delays or
 * refuses a request: accounting load stays off the request path.
 */
import type { AccountingCategory } from '@tuturuuu/session/control';

export const OP_FLUSH_INTERVAL_MS = 60_000;

export function createOpCounter(input: {
  now: () => number;
  flush: (counts: Partial<Record<AccountingCategory, number>>) => Promise<void>;
}) {
  let counts: Partial<Record<AccountingCategory, number>> = {};
  let lastFlushMs = input.now();
  let droppedFlushes = 0;

  return Object.freeze({
    record(category: AccountingCategory, amount = 1) {
      counts[category] = (counts[category] ?? 0) + amount;
    },

    /**
     * Returns a flush promise when one is due, for `ctx.waitUntil`, or null.
     * The counts are taken before the call, so a failed flush loses them.
     */
    maybeFlush(): Promise<void> | null {
      const nowMs = input.now();
      if (nowMs - lastFlushMs < OP_FLUSH_INTERVAL_MS) return null;
      lastFlushMs = nowMs;
      const batch = counts;
      counts = {};
      if (Object.keys(batch).length === 0) return null;
      return input.flush(batch).catch((error: unknown) => {
        droppedFlushes += 1;
        console.error(
          '[auth] session budget flush dropped',
          droppedFlushes,
          error
        );
      });
    },

    pending: () => ({ ...counts }),
    droppedFlushes: () => droppedFlushes,
  });
}
