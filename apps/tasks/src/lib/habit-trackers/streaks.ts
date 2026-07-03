import type {
  HabitTracker,
  HabitTrackerEntry,
  HabitTrackerEntryKind,
  HabitTrackerLeaderboardRow,
  HabitTrackerMember,
  HabitTrackerMemberSummary,
  HabitTrackerPeriodMetric,
  HabitTrackerStreakAction,
  HabitTrackerStreakSummary,
  HabitTrackerTeamSummary,
} from '@tuturuuu/types/primitives/HabitTracker';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_STARTS_ON = 1;

type PeriodWindow = {
  period_start: string;
  period_end: string;
};

type EffectiveMetric = HabitTrackerPeriodMetric & {
  is_current_period: boolean;
};

function parseDateKey(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function startOfUtcWeek(value: Date) {
  const currentDay = value.getUTCDay();
  const diff = (currentDay - WEEK_STARTS_ON + 7) % 7;
  return addUtcDays(value, -diff);
}

function getPeriodWindowForDate(
  dateKey: string,
  targetPeriod: HabitTracker['target_period']
): PeriodWindow {
  const parsed = parseDateKey(dateKey);

  if (targetPeriod === 'weekly') {
    const periodStart = startOfUtcWeek(parsed);
    return {
      period_start: formatDateKey(periodStart),
      period_end: formatDateKey(addUtcDays(periodStart, 6)),
    };
  }

  return {
    period_start: dateKey,
    period_end: dateKey,
  };
}

export function getCurrentPeriodWindow(
  targetPeriod: HabitTracker['target_period']
) {
  return getPeriodWindowForDate(formatDateKey(new Date()), targetPeriod);
}

function enumeratePeriodWindows(
  startDate: string,
  endDate: string,
  targetPeriod: HabitTracker['target_period']
) {
  const windows: PeriodWindow[] = [];

  if (targetPeriod === 'weekly') {
    let cursor = parseDateKey(
      getPeriodWindowForDate(startDate, 'weekly').period_start
    );
    const end = parseDateKey(
      getPeriodWindowForDate(endDate, 'weekly').period_start
    );

    while (cursor.getTime() <= end.getTime()) {
      windows.push({
        period_start: formatDateKey(cursor),
        period_end: formatDateKey(addUtcDays(cursor, 6)),
      });
      cursor = addUtcDays(cursor, 7);
    }

    return windows;
  }

  let cursor = parseDateKey(startDate);
  const end = parseDateKey(endDate);

  while (cursor.getTime() <= end.getTime()) {
    const key = formatDateKey(cursor);
    windows.push({
      period_start: key,
      period_end: key,
    });
    cursor = addUtcDays(cursor, 1);
  }

  return windows;
}

function compareToTarget(
  total: number,
  tracker: Pick<HabitTracker, 'target_operator' | 'target_value'>
) {
  if (tracker.target_operator === 'eq') {
    return total === tracker.target_value;
  }

  return total >= tracker.target_value;
}

function getEntryNumericValue(tracker: HabitTracker, entry: HabitTrackerEntry) {
  if (tracker.aggregation_strategy === 'count_entries') {
    return 1;
  }

  if (tracker.aggregation_strategy === 'boolean_any') {
    const rawValue =
      entry.values[tracker.primary_metric_key] ?? entry.primary_value ?? false;
    if (typeof rawValue === 'boolean') {
      return rawValue ? 1 : 0;
    }
    if (typeof rawValue === 'number') {
      return rawValue > 0 ? 1 : 0;
    }

    return String(rawValue).length > 0 ? 1 : 0;
  }

  const rawValue =
    entry.primary_value ?? entry.values[tracker.primary_metric_key];
  return typeof rawValue === 'number' && Number.isFinite(rawValue)
    ? rawValue
    : 0;
}

function buildMetricSeries(
  tracker: HabitTracker,
  entries: HabitTrackerEntry[],
  actions: HabitTrackerStreakAction[]
) {
  const currentPeriod = getCurrentPeriodWindow(tracker.target_period);
  const todayKey = formatDateKey(new Date());
  const startDate =
    tracker.start_date <= todayKey ? tracker.start_date : todayKey;
  const windows = enumeratePeriodWindows(
    startDate,
    currentPeriod.period_end,
    tracker.target_period
  );

  const totals = new Map<string, { total: number; entry_count: number }>();
  const actionByPeriod = new Map<
    string,
    Set<HabitTrackerStreakAction['action_type']>
  >();

  for (const entry of entries) {
    const period = getPeriodWindowForDate(
      entry.entry_date,
      tracker.target_period
    );
    const current = totals.get(period.period_start) ?? {
      total: 0,
      entry_count: 0,
    };
    const value = getEntryNumericValue(tracker, entry);

    switch (tracker.aggregation_strategy) {
      case 'max':
        current.total = Math.max(current.total, value);
        break;
      case 'count_entries':
        current.total += 1;
        break;
      case 'boolean_any':
        current.total = Math.max(current.total, value);
        break;
      default:
        current.total += value;
        break;
    }

    current.entry_count += 1;
    totals.set(period.period_start, current);
  }

  for (const action of actions) {
    const current = actionByPeriod.get(action.period_start) ?? new Set();
    current.add(action.action_type);
    actionByPeriod.set(action.period_start, current);
  }

  return windows.map<EffectiveMetric>((window) => {
    const current = totals.get(window.period_start) ?? {
      total: 0,
      entry_count: 0,
    };
    const actionSet = actionByPeriod.get(window.period_start) ?? new Set();
    const success = compareToTarget(current.total, tracker);

    return {
      period_start: window.period_start,
      period_end: window.period_end,
      total: current.total,
      success,
      used_freeze: actionSet.has('freeze'),
      used_repair: actionSet.has('repair'),
      entry_count: current.entry_count,
      is_current_period: window.period_start === currentPeriod.period_start,
    };
  });
}

function countBestStreak(metrics: EffectiveMetric[]) {
  let best = 0;
  let current = 0;

  for (const metric of metrics) {
    const effectiveSuccess =
      metric.success || metric.used_freeze || metric.used_repair;

    if (effectiveSuccess) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }

  return best;
}

function countCurrentStreak(metrics: EffectiveMetric[]) {
  let index = metrics.length - 1;

  if (index < 0) {
    return 0;
  }

  if (metrics[index]?.is_current_period && !metrics[index]?.success) {
    index -= 1;
  }

  let streak = 0;

  while (index >= 0) {
    const metric = metrics[index];
    if (!metric) {
      break;
    }
    const effectiveSuccess =
      metric.success || metric.used_freeze || metric.used_repair;

    if (!effectiveSuccess) {
      break;
    }

    streak += 1;
    index -= 1;
  }

  return streak;
}

function buildRecoveryWindow(
  tracker: HabitTracker,
  metrics: EffectiveMetric[]
): HabitTrackerStreakSummary['recovery_window'] {
  if (tracker.recovery_window_periods <= 0) {
    return { eligible: false, action: null };
  }

  const closedMetrics = metrics.filter((metric) => !metric.is_current_period);
  const failedMetric = [...closedMetrics]
    .reverse()
    .find(
      (metric) => !metric.success && !metric.used_freeze && !metric.used_repair
    );

  if (!failedMetric) {
    return { eligible: false, action: null };
  }

  const currentPeriodStart = parseDateKey(
    getCurrentPeriodWindow(tracker.target_period).period_start
  );
  const failedPeriodStart = parseDateKey(failedMetric.period_start);
  const distance =
    tracker.target_period === 'weekly'
      ? Math.floor(
          (currentPeriodStart.getTime() - failedPeriodStart.getTime()) /
            (DAY_MS * 7)
        )
      : Math.floor(
          (currentPeriodStart.getTime() - failedPeriodStart.getTime()) / DAY_MS
        );

  if (distance > tracker.recovery_window_periods) {
    return { eligible: false, action: null };
  }

  const expiry =
    tracker.target_period === 'weekly'
      ? addUtcDays(
          parseDateKey(failedMetric.period_end),
          tracker.recovery_window_periods * 7
        )
      : addUtcDays(
          parseDateKey(failedMetric.period_end),
          tracker.recovery_window_periods
        );

  return {
    eligible: true,
    period_start: failedMetric.period_start,
    period_end: failedMetric.period_end,
    expires_on: formatDateKey(expiry),
    action: 'repair',
  };
}

function countPerfectWeeks(metrics: EffectiveMetric[], tracker: HabitTracker) {
  const closedMetrics = metrics.filter((metric) => !metric.is_current_period);

  if (tracker.target_period === 'weekly') {
    return closedMetrics.filter(
      (metric) => metric.success || metric.used_freeze || metric.used_repair
    ).length;
  }

  const byWeek = new Map<string, EffectiveMetric[]>();

  for (const metric of closedMetrics) {
    const weekStart = getPeriodWindowForDate(
      metric.period_start,
      'weekly'
    ).period_start;
    const current = byWeek.get(weekStart) ?? [];
    current.push(metric);
    byWeek.set(weekStart, current);
  }

  let perfectWeeks = 0;

  for (const metricsForWeek of byWeek.values()) {
    if (metricsForWeek.length < 7) {
      continue;
    }

    if (
      metricsForWeek.every(
        (metric) => metric.success || metric.used_freeze || metric.used_repair
      )
    ) {
      perfectWeeks += 1;
    }
  }

  return perfectWeeks;
}

export function computeHabitTrackerStreakSummary(
  tracker: HabitTracker,
  entries: HabitTrackerEntry[],
  actions: HabitTrackerStreakAction[]
): {
  streak: HabitTrackerStreakSummary;
  metrics: HabitTrackerPeriodMetric[];
  current_period_total: number;
  total: number;
  entry_count: number;
} {
  const metrics = buildMetricSeries(tracker, entries, actions);
  const effectiveMetrics = metrics.filter(
    (metric) => !metric.is_current_period
  );
  const currentMetric = metrics.find((metric) => metric.is_current_period);
  const successMetrics = metrics.filter(
    (metric) => metric.success || metric.used_freeze || metric.used_repair
  );
  const freezesUsed = actions.filter(
    (action) => action.action_type === 'freeze'
  ).length;
  const totalClosedPeriods = effectiveMetrics.length;
  const consistencyRate =
    totalClosedPeriods === 0
      ? 0
      : Number(
          (
            (effectiveMetrics.filter(
              (metric) =>
                metric.success || metric.used_freeze || metric.used_repair
            ).length /
              totalClosedPeriods) *
            100
          ).toFixed(1)
        );

  return {
    streak: {
      current_streak: countCurrentStreak(metrics),
      best_streak: countBestStreak(metrics),
      last_success_date:
        successMetrics.length > 0
          ? successMetrics[successMetrics.length - 1]?.period_end
          : null,
      freeze_count: tracker.freeze_allowance,
      freezes_used: freezesUsed,
      perfect_week_count: countPerfectWeeks(metrics, tracker),
      consistency_rate: consistencyRate,
      recovery_window: buildRecoveryWindow(tracker, metrics),
    },
    metrics: metrics.map(({ is_current_period, ...metric }) => metric),
    current_period_total: currentMetric?.total ?? 0,
    total: metrics.reduce((sum, metric) => sum + metric.total, 0),
    entry_count: entries.length,
  };
}

export function buildHabitTrackerMemberSummary(
  tracker: HabitTracker,
  member: HabitTrackerMember,
  entries: HabitTrackerEntry[],
  actions: HabitTrackerStreakAction[]
): HabitTrackerMemberSummary {
  const summary = computeHabitTrackerStreakSummary(tracker, entries, actions);

  return {
    member,
    total: summary.total,
    entry_count: summary.entry_count,
    current_period_total: summary.current_period_total,
    streak: summary.streak,
  };
}

export function buildHabitTrackerLeaderboard(
  memberSummaries: HabitTrackerMemberSummary[]
): HabitTrackerLeaderboardRow[] {
  return [...memberSummaries]
    .sort((left, right) => {
      if (right.streak.current_streak !== left.streak.current_streak) {
        return right.streak.current_streak - left.streak.current_streak;
      }

      if (right.streak.best_streak !== left.streak.best_streak) {
        return right.streak.best_streak - left.streak.best_streak;
      }

      if (right.streak.consistency_rate !== left.streak.consistency_rate) {
        return right.streak.consistency_rate - left.streak.consistency_rate;
      }

      return right.current_period_total - left.current_period_total;
    })
    .map((summary) => ({
      member: summary.member,
      current_streak: summary.streak.current_streak,
      best_streak: summary.streak.best_streak,
      consistency_rate: summary.streak.consistency_rate,
      current_period_total: summary.current_period_total,
    }));
}

export function buildHabitTrackerTeamSummary(
  memberSummaries: HabitTrackerMemberSummary[]
): HabitTrackerTeamSummary {
  const activeMembers = memberSummaries.filter(
    (summary) => summary.entry_count > 0
  );
  const denominator = activeMembers.length || memberSummaries.length || 1;

  return {
    active_members: activeMembers.length,
    total_entries: memberSummaries.reduce(
      (sum, summary) => sum + summary.entry_count,
      0
    ),
    total_value: memberSummaries.reduce(
      (sum, summary) => sum + summary.total,
      0
    ),
    average_consistency_rate: Number(
      (
        memberSummaries.reduce(
          (sum, summary) => sum + summary.streak.consistency_rate,
          0
        ) / denominator
      ).toFixed(1)
    ),
    top_streak: Math.max(
      0,
      ...memberSummaries.map((summary) => summary.streak.current_streak)
    ),
  };
}

export function aggregateMetricsForTeam(
  tracker: HabitTracker,
  entriesByMember: Record<string, HabitTrackerEntry[]>,
  actionsByMember: Record<string, HabitTrackerStreakAction[]>
) {
  const windows = buildMetricSeries(tracker, [], []);
  const totals = new Map<string, { total: number; entry_count: number }>();

  for (const [userId, entries] of Object.entries(entriesByMember)) {
    const actions = actionsByMember[userId] ?? [];
    const metrics = buildMetricSeries(tracker, entries, actions);

    for (const metric of metrics) {
      const current = totals.get(metric.period_start) ?? {
        total: 0,
        entry_count: 0,
      };
      current.total += metric.total;
      current.entry_count += metric.entry_count;
      totals.set(metric.period_start, current);
    }
  }

  return windows.map<HabitTrackerPeriodMetric>((window) => {
    const current = totals.get(window.period_start) ?? {
      total: 0,
      entry_count: 0,
    };

    return {
      period_start: window.period_start,
      period_end: window.period_end,
      total: current.total,
      success: false,
      used_freeze: false,
      used_repair: false,
      entry_count: current.entry_count,
    };
  });
}

export function normalizeEntryKind(
  trackingMode: HabitTracker['tracking_mode']
): HabitTrackerEntryKind {
  return trackingMode === 'daily_summary' ? 'daily_summary' : 'event_log';
}
