import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/supabase';
import {
  getCalendarReportPeriod,
  getNextReportPeriodStart,
  type ReportCadence,
  reportLocalTimeToUtc,
} from '@tuturuuu/users-core/lib/reports/periods';

type AdminClient = Awaited<ReturnType<typeof createAdminClient<Database>>>;

interface ReportSchedule {
  cadence: ReportCadence;
  created_by: string | null;
  delivery_time: string;
  enabled: boolean;
  generation_mode: 'manual' | 'ai';
  group_id: string | null;
  id: string;
  manager_instruction: string | null;
  next_run_at: string | null;
  timezone: string | null;
  ws_id: string;
}

function isDue(schedule: ReportSchedule, now: Date) {
  return (
    schedule.enabled &&
    (!schedule.next_run_at ||
      new Date(schedule.next_run_at).getTime() <= now.getTime())
  );
}

export async function reconcilePeriodicReportSchedules(
  sbAdmin: AdminClient,
  now = new Date()
) {
  const privateDb = sbAdmin.schema('private');
  const schedulesResult = await privateDb
    .from('user_report_schedules')
    .select('*');
  if (schedulesResult.error) throw schedulesResult.error;
  const schedules = (schedulesResult.data ?? []) as ReportSchedule[];
  const dueSchedules = schedules.filter((schedule) => isDue(schedule, now));
  let createdRuns = 0;

  for (const schedule of dueSchedules) {
    if (!schedule.timezone) continue;
    const groupsResult = await sbAdmin
      .from('workspace_user_groups')
      .select('id')
      .eq('ws_id', schedule.ws_id)
      .eq('archived', false);
    if (groupsResult.error) throw groupsResult.error;

    const overriddenGroupIds = new Set(
      schedules
        .filter(
          (candidate) =>
            candidate.ws_id === schedule.ws_id &&
            candidate.cadence === schedule.cadence &&
            candidate.group_id
        )
        .map((candidate) => candidate.group_id)
    );
    const groupIds = schedule.group_id
      ? [schedule.group_id]
      : (groupsResult.data ?? [])
          .map((group) => group.id)
          .filter((groupId) => !overriddenGroupIds.has(groupId));
    const period = getCalendarReportPeriod({
      cadence: schedule.cadence,
      completed: schedule.generation_mode === 'ai',
      reference: now,
      timezone: schedule.timezone,
    });

    for (const groupId of groupIds) {
      const existing = await privateDb
        .from('user_report_automation_runs')
        .select('id')
        .eq('schedule_id', schedule.id)
        .eq('group_id', groupId)
        .eq('period_start', period.start)
        .eq('period_end', period.end)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) continue;

      const created = await privateDb
        .from('user_report_automation_runs')
        .insert({
          cadence: schedule.cadence,
          generation_mode: schedule.generation_mode,
          group_id: groupId,
          period_end: period.end,
          period_start: period.start,
          schedule_id: schedule.id,
          ws_id: schedule.ws_id,
        });
      if (created.error) {
        if (created.error.code !== '23505') throw created.error;
      } else {
        createdRuns++;
      }
    }

    const currentPeriod = getCalendarReportPeriod({
      cadence: schedule.cadence,
      reference: now,
      timezone: schedule.timezone,
    });
    const nextRunAt = reportLocalTimeToUtc({
      date: getNextReportPeriodStart(currentPeriod),
      time: schedule.delivery_time,
      timezone: schedule.timezone,
    }).toISOString();
    const updated = await privateDb
      .from('user_report_schedules')
      .update({
        next_run_at: nextRunAt,
        updated_at: now.toISOString(),
      })
      .eq('id', schedule.id);
    if (updated.error) throw updated.error;
  }

  return { createdRuns, dueSchedules: dueSchedules.length };
}
