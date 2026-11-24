/**
 * The isolate's view of the stop fence. An auth isolate reads
 * `SessionControl` at most once every 10 seconds and passes the snapshot into
 * every object call; objects never poll it on the request path. A failed read
 * keeps the last snapshot, whose age then decides: issuance fails closed past
 * 10 seconds and resolution answers `unavailable` past 5 minutes (see
 * `fenceDecision` in `@tuturuuu/session/control`). Concurrent callers share
 * one in-flight read, so a burst costs one `SessionControl` call.
 */
import {
  type FenceDecision,
  fenceDecision,
  type FenceMode,
  type FenceOperation,
  type FenceSnapshot,
  parseFenceFloor,
} from '@tuturuuu/session/control';

export const FENCE_READ_INTERVAL_MS = 10_000;

export type FenceReader = Readonly<{
  /** The freshest snapshot available, refreshing when due. */
  snapshot(): Promise<FenceSnapshot | null>;
  /** One mode-table decision under the current snapshot and floor. */
  decide(operation: FenceOperation): Promise<FenceDecision>;
  /** Count of `SessionControl` reads, for tests and accounting. */
  reads(): number;
}>;

export function createFenceReader(input: {
  read: () => Promise<FenceSnapshot>;
  now: () => number;
  /** `TTR_SESSION_FENCE_FLOOR`, read as given; mistyped values are `stopped`. */
  floor: string | null | undefined;
  onReadError?: (error: unknown) => void;
}): FenceReader {
  const floor: FenceMode = parseFenceFloor(input.floor);
  let held: FenceSnapshot | null = null;
  let lastAttemptMs = Number.NEGATIVE_INFINITY;
  let inFlight: Promise<void> | null = null;
  let readCount = 0;

  const refresh = () => {
    if (inFlight) return inFlight;
    lastAttemptMs = input.now();
    readCount += 1;
    inFlight = input
      .read()
      .then((snapshot) => {
        held = snapshot;
      })
      .catch((error: unknown) => {
        input.onReadError?.(error);
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const snapshot = async () => {
    // Failed reads also wait out the interval, so an outage costs at most one
    // `SessionControl` call per isolate per 10 seconds.
    if (input.now() - lastAttemptMs >= FENCE_READ_INTERVAL_MS) {
      await refresh();
    } else if (inFlight) {
      await inFlight;
    }
    return held;
  };

  return Object.freeze({
    snapshot,
    async decide(operation: FenceOperation) {
      const current = await snapshot();
      return fenceDecision({
        operation,
        snapshot: current,
        floor,
        nowMs: input.now(),
      });
    },
    reads: () => readCount,
  });
}
