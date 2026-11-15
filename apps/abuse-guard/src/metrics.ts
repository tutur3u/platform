import type { AbuseGuardFamily } from '@tuturuuu/utils/abuse-guard/protocol';

export type RpcTiming = {
  family: AbuseGuardFamily | 'unknown';
  admitMs: number;
  subjectMs: number;
};
export const newTiming = (): RpcTiming => ({
  family: 'unknown',
  admitMs: 0,
  subjectMs: 0,
});
export const elapsed = (start: number) =>
  Math.max(0, Math.round(performance.now() - start));

export function serverTiming(timing: RpcTiming) {
  return `admit;dur=${timing.admitMs}, subject;dur=${timing.subjectMs}`;
}

/** Native writeDataPoint queues asynchronously; metrics never gate admission. */
export function recordRpc(
  dataset: AnalyticsEngineDataset | undefined,
  timing: RpcTiming,
  outcome: string,
  totalMs: number
) {
  try {
    dataset?.writeDataPoint({
      blobs: [timing.family, outcome],
      doubles: [timing.admitMs, timing.subjectMs, totalMs],
    });
  } catch {
    // Telemetry failure must not change the security decision or retry writes.
  }
}
