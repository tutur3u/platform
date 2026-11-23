import { collapseAccounts } from './accounts';
import { matchingBlocks, type QuotaBlock } from './block-ledger';
import { computeAccountPacing, type ObservationSample } from './pacing';
import {
  evaluateModelPolicy,
  loadRoutingConfig,
  type RoutingConfig,
  selectAccountModels,
  topUpsForbidden,
} from './routing-config';
import {
  compareSignalOrder,
  signalOrderRemainingPercent,
} from './signal-order';
import type {
  AccountReserve,
  AccountUsage,
  ActiveAssignment,
  Provider,
  RankedInstance,
  Recommendation,
  RecommendationReason,
  TaskRequest,
  UsageWindow,
} from './types';
import { windowObservationIsFresh } from './window-freshness';
import { coversModel, noResetWindowMaxAgeMs } from './window-scope';

export interface RecommendOptions {
  blocks?: QuotaBlock[];
  task: TaskRequest;
  active: ActiveAssignment[];
  accounts: AccountUsage[];
  count?: number;
  reserves?: Record<string, AccountReserve>;
  now?: Date;
  staleAfterMs?: number;
  hardLimitPercent?: number;
  history?: Record<string, Record<string, ObservationSample[]>>;
  routingConfig?: RoutingConfig;
}

export const SIGNAL_TTL_MS: Record<Provider, number> = {
  codex: 15 * 60_000,
  claude: 15 * 60_000,
  antigravity: 5 * 60_000,
  grok: 5 * 60_000,
  cursor: 5 * 60_000,
  opencode: 5 * 60_000,
};

const DEFAULT_RESERVES: Record<string, AccountReserve> = {
  claude_hehe: { minRemainingPercent: 25, maxConcurrent: 1 },
};

function activeCount(id: string, active: ActiveAssignment[]): number {
  return active
    .filter((entry) => entry.instanceId === id)
    .reduce((sum, entry) => sum + Math.max(0, entry.count), 0);
}

function isIdleSessionWindow(window: UsageWindow): boolean {
  return (
    window.usedPercent === 0 &&
    window.providerWindowKind === 'session' &&
    !window.resetsAt &&
    window.authoritative
  );
}

function rankOne(
  account: AccountUsage,
  task: TaskRequest,
  active: ActiveAssignment[],
  reserve: AccountReserve | undefined,
  now: Date,
  staleAfterMs: number,
  hardLimitPercent: number,
  historyByWindow: Record<string, ObservationSample[]>,
  blocks: QuotaBlock[],
  routingConfig: RoutingConfig
): RankedInstance {
  const modelSelection = selectAccountModels(account, task, routingConfig);
  const effectiveModel =
    task.model ??
    (account.provider === 'antigravity' || account.provider === 'opencode'
      ? modelSelection.recommendedModel
      : undefined);
  const policyCheck = evaluateModelPolicy(
    account.provider,
    task.model,
    task,
    routingConfig
  );

  const observedWindows = account.windows;
  const scopedAccount = {
    ...account,
    windows: account.windows.filter((window) =>
      coversModel(window, effectiveModel)
    ),
  };
  const reasons: RecommendationReason[] = [];
  const windows = scopedAccount.windows.filter(
    (window): window is typeof window & { usedPercent: number } =>
      typeof window.usedPercent === 'number' &&
      Number.isFinite(window.usedPercent) &&
      window.usedPercent >= 0 &&
      window.usedPercent <= 100
  );
  const isFresh = (window: (typeof windows)[number]): boolean => {
    if (isIdleSessionWindow(window)) {
      return windowObservationIsFresh(window, now, staleAfterMs);
    }
    const resetAt = window.resetsAt ? Date.parse(window.resetsAt) : undefined;
    return (
      windowObservationIsFresh(window, now, staleAfterMs) &&
      resetAt !== undefined &&
      Number.isFinite(resetAt) &&
      resetAt > now.getTime()
    );
  };
  const freshWindows = windows.filter(
    (window) => window.authoritative && isFresh(window)
  );
  const staleWindows = windows.filter(
    (window) => !window.authoritative || !isFresh(window)
  );
  const count = (account.instanceIds ?? [account.instanceId]).reduce(
    (sum, id) => sum + activeCount(id, active),
    0
  );
  const ages = windows
    .map((window) => now.getTime() - Date.parse(window.observedAt))
    .filter(Number.isFinite);
  const ageMs = ages.length ? Math.max(0, ...ages) : null;
  const known =
    freshWindows.length > 0 &&
    staleWindows.length === 0 &&
    scopedAccount.windows.filter(
      (window) => typeof window.usedPercent === 'number'
    ).length === windows.length;
  const maximum = Math.max(...freshWindows.map((window) => window.usedPercent));
  const noTopUps = topUpsForbidden(account.provider, routingConfig);
  const balanceBlocked = Boolean(account.balance?.exhausted) && noTopUps;
  const topUpPromptBlocked =
    noTopUps &&
    /\b(?:buy credits|top up|payment required|402|usage balance exhausted|insufficient balance)\b/i.test(
      account.statusMessage ?? ''
    );
  const state =
    balanceBlocked || topUpPromptBlocked
      ? 'exhausted'
      : !known
        ? 'UNKNOWN'
        : maximum >= 100
          ? 'exhausted'
          : maximum >= hardLimitPercent
            ? 'near'
            : 'healthy';
  const weight = Math.max(0, task.weight ?? 1);
  const eligibleProvider =
    !task.provider ||
    task.provider === 'any' ||
    task.provider === account.provider;
  let eligible =
    eligibleProvider &&
    reserve?.excluded !== true &&
    state === 'healthy' &&
    account.available !== false &&
    policyCheck.allowed;

  if (account.alias) reasons.push({ code: 'alias', message: account.alias });
  if (account.available === false)
    reasons.push({
      code: 'unavailable',
      message: 'Live catalog does not allow delegation to this instance.',
    });
  if (balanceBlocked || topUpPromptBlocked) {
    eligible = false;
    reasons.push(
      {
        code: 'balance-exhausted',
        message: 'Provider usage balance/credits exhausted.',
      },
      {
        code: 'no-top-ups-policy',
        message:
          'Top-ups and credit purchases are forbidden by routing policy.',
      }
    );
  } else if (account.balance?.exhausted) {
    reasons.push({
      code: 'balance-exhausted-topup-allowed',
      message: 'Provider balance exhausted, but allowCreditsTopUp is enabled.',
    });
  }
  for (const policyReason of policyCheck.reasons) {
    reasons.push({
      code: policyReason,
      message: `Routing policy excludes this target (${policyReason}).`,
    });
  }
  if (
    !task.model &&
    (account.models?.length ?? 0) > 0 &&
    modelSelection.eligibleModels.length === 0
  ) {
    eligible = false;
    reasons.push({
      code: 'no-eligible-model',
      message: 'All models on this instance are excluded by routing policy.',
    });
  }
  if (!windows.length)
    reasons.push({
      code: observedWindows.some((window) => window.scope?.kind === 'unknown')
        ? 'scope-unverified'
        : 'no-usage-signal',
      message: observedWindows.some(
        (window) => window.scope?.kind === 'unknown'
      )
        ? 'A provider window exists, but its model scope is unverified; it cannot establish headroom or exhaustion for this task.'
        : 'No authoritative usage signal is exposed; eligibility is UNKNOWN.',
    });
  const kind = task.kind ?? 'implementation';
  reasons.push({
    code: 'task-kind',
    message: `${kind}: ranked via configured task-kind preferences and quota safety.`,
  });
  if (task.model && !account.models?.includes(task.model)) {
    eligible = false;
    reasons.push({
      code: 'model-unverified',
      message: 'Requested model is not verified in this instance live catalog.',
    });
  }
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
    if (freshWindows.some((window) => window.usedPercent >= hardLimitPercent)) {
      eligible = false;
      reasons.push({
        code: 'near-limit',
        message: `Excluded because a reported window meets or exceeds ${hardLimitPercent}% used.`,
      });
    }
    const remaining = Math.min(...headrooms);
    if (
      reserve?.minRemainingPercent !== undefined &&
      remaining < reserve.minRemainingPercent
    ) {
      eligible = false;
      reasons.push({
        code: 'reserve',
        message: `Below the configured ${reserve.minRemainingPercent}% remaining reserve.`,
      });
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
    if (
      scopedAccount.windows.some((window) => window.estimated !== undefined)
    ) {
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
  if (state === 'near' || state === 'exhausted')
    reasons.push({
      code: 'drain',
      message:
        'Drain existing work; do not assign new lanes until fresh usage confirms recovery.',
    });
  if (staleWindows.length) {
    score = Math.min(score, freshWindows.length ? 60 : 18);
    if (
      staleWindows.some((window) => {
        if (window.usedPercent < hardLimitPercent) return false;
        if (window.resetsAt) {
          const reset = Date.parse(window.resetsAt);
          return Number.isFinite(reset) && reset > now.getTime();
        }
        const observed = Date.parse(window.observedAt);
        return (
          Number.isFinite(observed) &&
          now.getTime() - observed <= noResetWindowMaxAgeMs(window)
        );
      })
    ) {
      eligible = false;
      reasons.push({
        code: 'near-limit-stale',
        message: `Excluded because a stale window at or above ${hardLimitPercent}% used has not reset or aged out.`,
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

  const pacing = computeAccountPacing(
    account,
    count,
    reserve,
    historyByWindow,
    now,
    staleAfterMs,
    {
      model: effectiveModel,
      blocks,
      config: routingConfig.pacing,
      routingConfig,
      hardLimitPercent,
    }
  );
  if (state === 'healthy' && !pacing.safeToAdmit) {
    if (
      pacing.reasons.includes('below-glide-floor') ||
      pacing.reasons.includes('projected-exhaustion-before-reset')
    ) {
      eligible = false;
      reasons.push({
        code: pacing.reasons.includes('projected-exhaustion-before-reset')
          ? 'projected-exhaustion-before-reset'
          : 'below-glide-floor',
        message:
          'Pacing guard: remaining headroom is below glide floor or projects exhaustion before reset.',
      });
    }
  }

  const taskWeight =
    routingConfig.taskKinds[kind]?.providerWeights[account.provider] ?? 1;
  const designOpusBoost =
    (kind === 'design' || kind === 'ui') &&
    account.provider === 'claude' &&
    modelSelection.recommendedModel?.toLowerCase().includes('opus')
      ? 12
      : 0;
  if (state === 'healthy') {
    score += taskWeight * 2 + designOpusBoost;
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
    state,
    ageMs,
    ttlMs: Math.min(
      staleAfterMs,
      ...windows.map((window) =>
        window.freshnessTtlMs === undefined
          ? staleAfterMs
          : Math.min(staleAfterMs, window.freshnessTtlMs)
      )
    ),
    activeCount: count,
    action:
      state === 'near' || state === 'exhausted'
        ? 'drain'
        : eligible
          ? 'delegate'
          : 'wait',
    instanceIds: account.instanceIds ?? [account.instanceId],
    score,
    unknownOrderHint: signalOrderRemainingPercent(
      account.windows,
      effectiveModel,
      now
    ),
    eligible,
    reasons,
    pacing,
    ...(modelSelection.recommendedModel
      ? { recommendedModel: modelSelection.recommendedModel }
      : {}),
    ...(modelSelection.eligibleModels.length
      ? { eligibleModels: modelSelection.eligibleModels }
      : {}),
    ...(modelSelection.excludedModels.length
      ? { excludedModels: modelSelection.excludedModels }
      : {}),
    ...(account.providerStatus
      ? { providerStatus: account.providerStatus }
      : {}),
    ...(account.statusMessage ? { statusMessage: account.statusMessage } : {}),
    ...(account.balance ? { balance: account.balance } : {}),
  };
}

export function recommend(options: RecommendOptions): Recommendation {
  const now = options.now ?? new Date();
  const hardLimitPercent = options.hardLimitPercent ?? 90;
  const reserves = { ...DEFAULT_RESERVES, ...options.reserves };
  const routingConfig = options.routingConfig ?? loadRoutingConfig();
  const simulated = new Map(
    options.active.map((entry) => [entry.instanceId, entry.count])
  );
  const ranked = collapseAccounts(options.accounts, options.task.model)
    .map((account) => {
      const mergedHistory: Record<string, ObservationSample[]> = {};
      for (const id of account.instanceIds ?? [account.instanceId]) {
        const entry = options.history?.[id];
        if (!entry) continue;
        for (const [winId, samples] of Object.entries(entry)) {
          mergedHistory[winId] = [...(mergedHistory[winId] ?? []), ...samples];
        }
      }
      return rankOne(
        account,
        options.task,
        [...simulated].map(([instanceId, count]) => ({ instanceId, count })),
        mergeReserves(account.instanceIds ?? [account.instanceId], reserves),
        now,
        options.staleAfterMs ?? SIGNAL_TTL_MS[account.provider],
        hardLimitPercent,
        mergedHistory,
        options.blocks ?? [],
        routingConfig
      );
    })
    .map((item) =>
      matchingBlocks(
        options.blocks ?? [],
        item.instanceIds,
        options.task.model,
        now
      ).length
        ? {
            ...item,
            eligible: false,
            action: 'drain' as const,
            reasons: [
              ...item.reasons,
              {
                code: 'observed-block-ledger',
                message:
                  'An observed block forbids this pool/model before its eligibility time.',
              },
            ],
          }
        : item
    )
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        Number(b.state === 'healthy') - Number(a.state === 'healthy') ||
        (a.state === 'UNKNOWN' && b.state === 'UNKNOWN'
          ? compareSignalOrder(a.unknownOrderHint, b.unknownOrderHint)
          : 0) ||
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

function mergeReserves(
  ids: string[],
  reserves: Record<string, AccountReserve>
): AccountReserve | undefined {
  const entries = ids
    .map((id) => reserves[id])
    .filter((value): value is AccountReserve => Boolean(value));
  if (!entries.length) return;
  const remaining = entries
    .map((value) => value.minRemainingPercent)
    .filter((value): value is number => value !== undefined);
  const concurrency = entries
    .map((value) => value.maxConcurrent)
    .filter((value): value is number => value !== undefined);
  return {
    excluded: entries.some((value) => value.excluded),
    ...(remaining.length
      ? { minRemainingPercent: Math.max(...remaining) }
      : {}),
    ...(concurrency.length ? { maxConcurrent: Math.min(...concurrency) } : {}),
  };
}
