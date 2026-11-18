const HOUR = 3_600_000;
const MAX_FAILURES = 3;

export type Attempt = { slot: number; failures: number };

export function reserveRefresh(
  enabled: boolean,
  scheduledTime: number,
  now: number,
  previous?: Attempt
): Attempt | null {
  if (
    !enabled ||
    !Number.isFinite(scheduledTime) ||
    scheduledTime > now ||
    now - scheduledTime >= HOUR
  )
    return null;
  const slot = Math.floor(scheduledTime / HOUR);
  if (previous && (previous.slot >= slot || previous.failures >= MAX_FAILURES))
    return null;
  return { slot, failures: (previous?.failures ?? 0) + 1 };
}
