import type {
  AccountReserve,
  AccountUsage,
  ActiveAssignment,
  RankedInstance,
  Recommendation,
  RecommendationReason,
  TaskRequest,
} from './types';

export interface RecommendOptions {
  task: TaskRequest;
  active: ActiveAssignment[];
  accounts: AccountUsage[];
  count?: number;
  reserves?: Record<string, AccountReserve>;
  now?: Date;
  staleAfterMs?: number;
  hardLimitPercent?: number;
}

const DEFAULT_RESERVES: Record<string, AccountReserve> = {
  claude_hehe: { minRemainingPercent: 25, maxConcurrent: 1 },
};

function activeCount(id: string, active: ActiveAssignment[]): number {
  return active.find((entry) => entry.instanceId === id)?.count ?? 0;
}

function rankOne(
  account: AccountUsage,
  task: TaskRequest,
  active: ActiveAssignment[],
  reserve: AccountReserve | undefined,
  now: Date,
  staleAfterMs: number,
  hardLimitPercent: number
): RankedInstance {
  const reasons: RecommendationReason[] = [];
  const windows = account.windows.filter(
    (window): window is typeof window & { usedPercent: number } =>
      typeof window.usedPercent === 'number'
  );
  const isFresh = (window: (typeof windows)[number]): boolean => {
    const observedAt = Date.parse(window.observedAt);
    const resetAt = window.resetsAt ? Date.parse(window.resetsAt) : undefined;
    return (
      Number.isFinite(observedAt) &&
      observedAt <= now.getTime() + 5 * 60_000 &&
      now.getTime() - observedAt <= staleAfterMs &&
      (resetAt === undefined ||
        !Number.isFinite(resetAt) ||
        resetAt > now.getTime())
    );
  };
  const freshWindows = windows.filter(isFresh);
  const staleWindows = windows.filter((window) => !isFresh(window));
  const count = activeCount(account.instanceId, active);
  const weight = Math.max(0, task.weight ?? 1);
  const eligibleProvider =
    !task.provider ||
    task.provider === 'any' ||
    task.provider === account.provider;
  let eligible = eligibleProvider && reserve?.excluded !== true;
  if (!eligibleProvider)
    reasons.push({
      code: 'provider-mismatch',
      message: `Task requests ${task.provider}; account is ${account.provider}.`,
    });
  if (task.model)
    reasons.push({
      code: 'model-requested',
      message: `Requested model ${task.model}; quota ranking does not replace T3 model availability checks.`,
    });
  if (reserve?.excluded)
    reasons.push({
      code: 'reserved-excluded',
      message: 'Account is excluded by reserve configuration.',
    });

  let score = 18;
  if (freshWindows.length) {
    const headrooms = freshWindows.map((window) => 100 - window.usedPercent);
    const weakest = Math.min(...headrooms);
    const avg =
      headrooms.reduce((sum, value) => sum + value, 0) / headrooms.length;
    score = weakest * 0.7 + avg * 0.3 - weight * 4;
    reasons.push({
      code: 'headroom',
      message: `${Math.round(weakest)}% remaining in the tightest reported window.`,
    });
    if (freshWindows.some((window) => window.usedPercent > hardLimitPercent)) {
      eligible = false;
      reasons.push({
        code: 'near-limit',
        message: `Excluded because a reported window exceeds ${hardLimitPercent}% used.`,
      });
    }
    const remaining = Math.min(...headrooms);
    if (reserve?.minRemainingPercent !== undefined) {
      if (remaining < reserve.minRemainingPercent) {
        eligible = false;
        reasons.push({
          code: 'reserve',
          message: `Below the configured ${reserve.minRemainingPercent}% remaining reserve.`,
        });
      }
    }
    const reset = freshWindows
      .map((window) => window.resetsAt)
      .filter((value): value is string => Boolean(value))
      .map(Date.parse)
      .filter(Number.isFinite);
    if (reset.length) {
      const soonest = Math.min(...reset);
      const delay = Math.max(0, soonest - now.getTime());
      const minutes = Math.round(delay / 60_000);
      if (soonest <= now.getTime()) {
        reasons.push({
          code: 'reset-expired',
          message: 'Reported reset time has passed; reset timing is uncertain.',
        });
      } else if (delay <= 15 * 60_000) {
        score += 4;
        reasons.push({
          code: 'reset-soon',
          message: `A quota window resets in about ${minutes} minutes.`,
        });
      } else {
        reasons.push({
          code: 'reset',
          message: `Next reported reset is in about ${minutes} minutes.`,
        });
      }
    } else {
      reasons.push({
        code: 'reset-unknown',
        message: 'No reset timestamp was reported.',
      });
    }
  } else {
    score = 18;
    reasons.push({
      code: 'quota-unknown',
      message:
        'No authoritative percentage is available; ranking is conservative.',
    });
    if (account.windows.some((window) => window.estimated !== undefined)) {
      reasons.push({
        code: 'estimated-only',
        message:
          'Token totals are estimates and are not treated as quota headroom.',
      });
    }
  }
  if (reserve?.minRemainingPercent !== undefined && freshWindows.length === 0) {
    eligible = false;
    reasons.push({
      code: 'reserve-unknown',
      message: `Cannot verify the configured ${reserve.minRemainingPercent}% remaining reserve.`,
    });
  }

  if (staleWindows.length) {
    score = Math.min(score, freshWindows.length ? 60 : 18);
    if (
      staleWindows.some((window) => {
        const resetAt = window.resetsAt
          ? Date.parse(window.resetsAt)
          : Number.NaN;
        return (
          window.usedPercent > hardLimitPercent &&
          Number.isFinite(resetAt) &&
          resetAt > now.getTime()
        );
      })
    ) {
      eligible = false;
      reasons.push({
        code: 'near-limit-stale',
        message: `Excluded because a stale window above ${hardLimitPercent}% used has not reset yet.`,
      });
    }
    reasons.push({
      code: 'stale',
      message: freshWindows.length
        ? 'At least one quota window is stale and counts as uncertain.'
        : 'No current quota window is available; stale data counts as uncertain.',
    });
    if (
      staleWindows.some(
        (window) =>
          window.resetsAt && Date.parse(window.resetsAt) <= now.getTime()
      )
    )
      reasons.push({
        code: 'reset-expired',
        message: 'A quota window reset timestamp has passed.',
      });
  } else if (windows.length === 0) {
    reasons.push({
      code: 'stale',
      message:
        'No current quota window is available; token estimates are not headroom.',
    });
  } else if (freshWindows.length) {
    reasons.push({ code: 'fresh', message: 'Quota percentage is current.' });
  }
  score -= count * 30;
  reasons.push({
    code: 'in-flight',
    message: `${count} active assignment${count === 1 ? '' : 's'} currently use this account.`,
  });
  if (reserve?.maxConcurrent !== undefined && count >= reserve.maxConcurrent) {
    eligible = false;
    reasons.push({
      code: 'concurrency-reserve',
      message: `At the configured limit of ${reserve.maxConcurrent} active assignment${reserve.maxConcurrent === 1 ? '' : 's'}.`,
    });
  }
  if (count > 0) score -= Math.min(15, count * 3);
  score = Math.max(-100, Math.min(100, score));
  return {
    instanceId: account.instanceId,
    provider: account.provider,
    label: account.label,
    score,
    eligible,
    reasons,
  };
}

export function recommend(options: RecommendOptions): Recommendation {
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? 15 * 60_000;
  const hardLimitPercent = options.hardLimitPercent ?? 90;
  const reserves = { ...DEFAULT_RESERVES, ...options.reserves };
  const simulated = new Map(
    options.active.map((entry) => [entry.instanceId, entry.count])
  );
  const ranked = options.accounts
    .map((account) =>
      rankOne(
        account,
        options.task,
        [...simulated].map(([instanceId, count]) => ({ instanceId, count })),
        reserves[account.instanceId],
        now,
        staleAfterMs,
        hardLimitPercent
      )
    )
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        b.score - a.score ||
        a.instanceId.localeCompare(b.instanceId)
    );
  const selected: RankedInstance[] = [];
  const count = Math.max(0, options.count ?? 1);
  for (let i = 0; i < count; i++) {
    const candidate = ranked.find(
      (item) =>
        item.eligible &&
        !selected.some((picked) => picked.instanceId === item.instanceId)
    );
    if (!candidate) break;
    selected.push(candidate);
  }
  return { ranked, selected };
}

export function recommendAssignments(
  options: Omit<RecommendOptions, 'count'> & { count: number }
): RankedInstance[] {
  const selected: RankedInstance[] = [];
  const active = options.active.map((entry) => ({ ...entry }));
  for (let i = 0; i < options.count; i++) {
    const next = recommend({ ...options, active, count: 1 }).selected[0];
    if (!next) break;
    selected.push(next);
    const current = active.find(
      (entry) => entry.instanceId === next.instanceId
    );
    if (current) current.count += 1;
    else active.push({ instanceId: next.instanceId, count: 1 });
  }
  return selected;
}
