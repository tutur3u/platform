import { type NextRequest, NextResponse } from 'next/server';
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

    const { data: entries, error } = await buildEntryQuery(auth, url).limit(
      5000
    );

    if (error) throw error;

    const byDate = new Map<string, number>();
    const byTag = new Map<string, number>();
    let total = 0;

    for (const entry of withEffectiveProgressValues(entries ?? [])) {
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

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      selectedMetricId,
      metrics: metrics ?? [],
      summary: {
        total,
        entriesCount: entries?.length ?? 0,
        activeDays: daily.filter((day) => day.value > 0).length,
        currentStreak: countCurrentStreak(byDate),
        longestStreak: countLongestStreak(byDate),
      },
      daily,
      heatmap: daily,
      tags,
    });
  } catch (error) {
    if (isTaskProgressSchemaUnavailableError(error)) {
      return taskProgressSchemaUnavailableResponse({
        metrics: [],
        summary: {
          total: 0,
          entriesCount: 0,
          activeDays: 0,
          currentStreak: 0,
          longestStreak: 0,
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
