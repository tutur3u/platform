import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database, Json } from '@tuturuuu/types/supabase';
import type { PeriodicReportGenerationContext } from './generation';

type AdminClient = Awaited<ReturnType<typeof createAdminClient<Database>>>;

interface ScopedContextInput {
  cadence: PeriodicReportGenerationContext['cadence'];
  groupId: string;
  periodEnd: string;
  periodStart: string;
  reportId?: string;
  userId: string;
  wsId: string;
}

interface ScopedMetric {
  factor: number;
  id: string;
  is_weighted: boolean;
  name: string;
  unit: string;
}

interface IndicatorValue {
  created_at: string;
  indicator_id: string;
  value: number | null;
}

export function buildScopedDeterministicMetrics({
  attendance,
  dailyChecks,
  indicators,
  metrics,
  sessions,
}: {
  attendance: Array<{ date: string; notes: string; status: string }>;
  dailyChecks: Array<{
    approval_status: string;
    is_completed: boolean;
    post_id: string;
  }>;
  indicators: IndicatorValue[];
  metrics: ScopedMetric[];
  sessions: Array<{
    ends_at: string;
    starts_at: string;
    status: string;
    title: string | null;
  }>;
}): Record<string, Json> {
  const latestIndicatorByMetric = new Map<string, IndicatorValue>();
  for (const value of indicators) {
    const current = latestIndicatorByMetric.get(value.indicator_id);
    if (!current || current.created_at < value.created_at) {
      latestIndicatorByMetric.set(value.indicator_id, value);
    }
  }

  return {
    attendance: attendance.map(({ date, notes, status }) => ({
      date,
      notes,
      status,
    })),
    daily_reports: {
      approved: dailyChecks.filter(
        (check) => check.approval_status === 'APPROVED'
      ).length,
      completed: dailyChecks.filter((check) => check.is_completed).length,
      total: dailyChecks.length,
    },
    metrics: metrics.map((metric) => ({
      factor: metric.factor,
      is_weighted: metric.is_weighted,
      name: metric.name,
      unit: metric.unit,
      value: latestIndicatorByMetric.get(metric.id)?.value ?? null,
    })),
    sessions: sessions.map(({ ends_at, starts_at, status, title }) => ({
      ends_at,
      starts_at,
      status,
      title,
    })),
  };
}

export async function loadScopedReportContext(
  sbAdmin: AdminClient,
  input: ScopedContextInput
) {
  const rangeStart = `${input.periodStart}T00:00:00.000Z`;
  const rangeEnd = `${input.periodEnd}T23:59:59.999Z`;
  const privateDb = sbAdmin.schema('private');

  const [metricsResult, attendanceResult, sessionsResult, postsResult] =
    await Promise.all([
      sbAdmin
        .from('user_group_metrics')
        .select('id, name, unit, factor, is_weighted')
        .eq('ws_id', input.wsId)
        .or(`group_id.eq.${input.groupId},group_id.is.null`)
        .order('name')
        .limit(100),
      sbAdmin
        .from('user_group_attendance')
        .select('date, status, notes')
        .eq('group_id', input.groupId)
        .eq('user_id', input.userId)
        .gte('date', input.periodStart)
        .lte('date', input.periodEnd)
        .order('date')
        .limit(200),
      privateDb
        .from('workspace_user_group_sessions')
        .select('title, starts_at, ends_at, status')
        .eq('ws_id', input.wsId)
        .eq('group_id', input.groupId)
        .gte('starts_at', rangeStart)
        .lte('starts_at', rangeEnd)
        .order('starts_at')
        .limit(200),
      privateDb
        .from('user_group_posts')
        .select('id')
        .eq('group_id', input.groupId)
        .gte('created_at', rangeStart)
        .lte('created_at', rangeEnd)
        .order('created_at')
        .limit(200),
    ]);

  if (metricsResult.error) throw metricsResult.error;
  if (attendanceResult.error) throw attendanceResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  if (postsResult.error) throw postsResult.error;

  const metricIds = (metricsResult.data ?? []).map((metric) => metric.id);
  const postIds = (postsResult.data ?? []).map((post) => post.id);
  const [indicatorsResult, checksResult, previousResult] = await Promise.all([
    metricIds.length
      ? sbAdmin
          .from('user_indicators')
          .select('indicator_id, value, created_at')
          .eq('user_id', input.userId)
          .in('indicator_id', metricIds)
          .lte('created_at', rangeEnd)
          .order('created_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    postIds.length
      ? privateDb
          .from('user_group_post_checks')
          .select('post_id, is_completed, approval_status')
          .eq('user_id', input.userId)
          .in('post_id', postIds)
      : Promise.resolve({ data: [], error: null }),
    privateDb
      .from('external_user_monthly_reports')
      .select('title, content, feedback, period_end')
      .eq('user_id', input.userId)
      .eq('group_id', input.groupId)
      .eq('cadence', input.cadence)
      .neq('id', input.reportId ?? '00000000-0000-0000-0000-000000000000')
      .lt('period_end', input.periodStart)
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (indicatorsResult.error) throw indicatorsResult.error;
  if (checksResult.error) throw checksResult.error;
  if (previousResult.error) throw previousResult.error;

  return {
    deterministicMetrics: buildScopedDeterministicMetrics({
      attendance: attendanceResult.data ?? [],
      dailyChecks: checksResult.data ?? [],
      indicators: indicatorsResult.data ?? [],
      metrics: metricsResult.data ?? [],
      sessions: sessionsResult.data ?? [],
    }),
    previousReport: previousResult.data
      ? {
          content: previousResult.data.content,
          feedback: previousResult.data.feedback,
          periodEnd: previousResult.data.period_end,
          title: previousResult.data.title,
        }
      : null,
  };
}
