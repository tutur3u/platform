const urgentThresholdMs = 30_000;
const defaultDurationMs = 60_000;

export interface PollCountdownState {
  remainingMs: number;
  formatted: string;
  isUrgent: boolean;
  isExpired: boolean;
  progress: number;
}

/** Progress is the fraction of the poll duration remaining. */
export function getPollCountdownState(
  closesAtMs: number,
  nowMs: number,
  durationMs = defaultDurationMs
): PollCountdownState {
  const difference = closesAtMs - nowMs;
  const remainingMs = Number.isFinite(difference) ? Math.max(0, difference) : 0;
  const duration =
    Number.isFinite(durationMs) && durationMs > 0
      ? durationMs
      : defaultDurationMs;
  const seconds = Math.ceil(remainingMs / 1000);
  const minutesLabel = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secondsLabel = String(seconds % 60).padStart(2, '0');
  const isExpired = remainingMs === 0;

  return {
    remainingMs,
    formatted: minutesLabel.concat(':', secondsLabel),
    isUrgent: !isExpired && remainingMs < urgentThresholdMs,
    isExpired,
    progress: Math.min(1, remainingMs / duration),
  };
}

function normalizeCount(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

export function summarizeParticipation(votedCount: number, totalCount: number) {
  const total = normalizeCount(totalCount);
  const voted = Math.min(normalizeCount(votedCount), total);

  return {
    votedCount: voted,
    totalCount: total,
    remainingCount: total - voted,
    percentage: total === 0 ? 0 : Math.round((voted / total) * 100),
  };
}
