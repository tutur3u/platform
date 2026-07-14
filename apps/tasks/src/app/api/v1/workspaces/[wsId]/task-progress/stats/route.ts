import { connection, type NextRequest, NextResponse } from 'next/server';
import {
  isAutonomousTaskMetric,
  loadAutonomousTaskProgressEntries,
} from '../_autonomous';
import { buildTaskProgressInsights } from '../_insights';
import {
  buildEntryQuery,
  ensureDefaultTaskProgressMetrics,
  isTaskProgressSchemaUnavailableError,
  logTaskProgressError,
  resolveTaskProgressRouteAuth,
  TASK_PROGRESS_METRIC_SELECT,
  type TaskProgressRouteContext,
  taskProgressRouteErrorResponse,
  taskProgressSchemaUnavailableResponse,
  withEffectiveProgressValues,
} from '../_utils';

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function countCurrentStreak(byDate: Map<string, number>) {
  let streak = 0;
  let cursor = new Date();

  for (;;) {
    const key = formatDate(cursor);
    if ((byDate.get(key) ?? 0) <= 0) return streak;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
}

function countLongestStreak(byDate: Map<string, number>) {
  const dates = [...byDate.entries()]
    .filter(([, value]) => value > 0)
    .map(([date]) => date)
    .sort();
  let longest = 0;
  let current = 0;
  let previous: string | null = null;

  for (const date of dates) {
    const expected = previous
      ? formatDate(addDays(new Date(`${previous}T00:00:00.000Z`), 1))
      : null;
    current = expected === date ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }

  return longest;
}

export async function GET(
  request: NextRequest,
  context: TaskProgressRouteContext
) {
  await connection();
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureDefaultTaskProgressMetrics(auth);

    const url = new URL(request.url);
    const { data: metrics, error: metricsError } = await (auth.sbAdmin as any)
      .from('task_progress_metrics')
      .select(TASK_PROGRESS_METRIC_SELECT)
      .eq('ws_id', auth.wsId)
      .is('archived_at', null)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (metricsError) throw metricsError;

    const selectedMetricId =
      url.searchParams.get('metric_id') || metrics?.[0]?.id || null;
    if (selectedMetricId) url.searchParams.set('metric_id', selectedMetricId);
    const selectedMetric = (metrics ?? []).find(
      (metric: { id: string }) => metric.id === selectedMetricId
    );
    let entries: Record<string, any>[] = [];
    if (selectedMetric && isAutonomousTaskMetric(selectedMetric)) {
      entries = await loadAutonomousTaskProgressEntries(auth, selectedMetric);
    } else {
      const { data, error } = await buildEntryQuery(auth, url).limit(5000);
      if (error) throw error;
      entries = withEffectiveProgressValues(data ?? []);
    }

    const byDate = new Map<string, number>();
    const byTag = new Map<string, number>();
    let total = 0;

    for (const entry of entries) {
      if (!entry.entry_date) continue;

      const value = Number(entry.effectiveValue ?? 0);
      total += value;
      byDate.set(entry.entry_date, (byDate.get(entry.entry_date) ?? 0) + value);

      const entryTags = Array.isArray(entry.tags) ? entry.tags : [];
      for (const tag of entryTags) {
        byTag.set(tag, (byTag.get(tag) ?? 0) + value);
      }
    }

    const daily = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));
    const tags = [...byTag.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([tag, value]) => ({ tag, value }));
    const today = formatDate(new Date());
    const sevenDaysAgo = formatDate(addDays(new Date(), -6));
    const fourteenDaysAgo = formatDate(addDays(new Date(), -13));
    const previousWeekEnd = formatDate(addDays(new Date(), -7));
    const sumRange = (from: string, to: string) =>
      daily
        .filter((day) => day.date >= from && day.date <= to)
        .reduce((sum, day) => sum + day.value, 0);
    const last7Days = sumRange(sevenDaysAgo, today);
    const previous7Days = sumRange(fourteenDaysAgo, previousWeekEnd);
    const trendPercent =
      previous7Days > 0
        ? ((last7Days - previous7Days) / previous7Days) * 100
        : last7Days > 0
          ? 100
          : 0;
    const activeDays = daily.filter((day) => day.value > 0).length;
    const intelligence = buildTaskProgressInsights(daily);

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      selectedMetricId,
      metrics: metrics ?? [],
      summary: {
        total,
        entriesCount: entries.length,
        activeDays,
        currentStreak: countCurrentStreak(byDate),
        longestStreak: countLongestStreak(byDate),
        today: byDate.get(today) ?? 0,
        last7Days,
        previous7Days,
        trendPercent,
        averagePerActiveDay: activeDays > 0 ? total / activeDays : 0,
      },
      ...intelligence,
      daily,
      heatmap: daily,
      tags,
    });
  } catch (error) {
    if (isTaskProgressSchemaUnavailableError(error)) {
      return taskProgressSchemaUnavailableResponse({
        metrics: [],
        summary: {
          activeDays: 0,
          averagePerActiveDay: 0,
          currentStreak: 0,
          entriesCount: 0,
          last7Days: 0,
          longestStreak: 0,
          previous7Days: 0,
          today: 0,
          total: 0,
          trendPercent: 0,
        },
        periods: {
          last7Days: 0,
          last30Days: 0,
          previousMonth: 0,
          previousWeek: 0,
          thisMonth: 0,
          thisWeek: 0,
        },
        insights: {
          activeDaysLast30: 0,
          averageLast7: 0,
          averageLast30: 0,
          bestDay: null,
          consistencyScore: 0,
          momentumStatus: 'starting',
          projectedWeek: 0,
          recommendation: 'start_small',
          strongestWeekday: null,
          weekTrendPercent: 0,
          weekdayTotals: [],
        },
        daily: [],
        heatmap: [],
        tags: [],
      });
    }

    logTaskProgressError('Failed to load task progress stats', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to load task progress stats'
    );
  }
}
