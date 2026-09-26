import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import dayjs from 'dayjs';
import '../dayjs-setup';
import { listMissingUserGroupSessionOccurrences } from './session-schedule';
import { DEFAULT_TIMEZONE, privateClient } from './session-schedule-data';
import type { SessionRow } from './session-schedule-types';

/** Read planned dates in a bounded invoice period, including recurring sessions
 * that have not been materialized yet. This preview never reconciles or writes. */
export async function listPlannedUserGroupSessionDatesByGroupIds({
  from,
  groupIds,
  supabase,
  timezone = DEFAULT_TIMEZONE,
  to,
  wsId,
}: {
  from: string;
  groupIds: string[];
  supabase: TypedSupabaseClient;
  timezone?: string;
  to: string;
  wsId: string;
}) {
  const uniqueGroupIds = Array.from(new Set(groupIds.filter(Boolean)));
  const dates = new Map<string, Set<string>>(
    uniqueGroupIds.map((groupId) => [groupId, new Set<string>()])
  );
  if (uniqueGroupIds.length === 0) return new Map<string, string[]>();

  const { data, error } = await privateClient(supabase)
    .from('workspace_user_group_sessions')
    .select('group_id, starts_at')
    .eq('ws_id', wsId)
    .in('group_id', uniqueGroupIds)
    .eq('status', 'scheduled')
    .gte('starts_at', from)
    .lte('starts_at', to)
    .order('starts_at');
  if (error) throw error;

  for (const session of (data ?? []) as Pick<
    SessionRow,
    'group_id' | 'starts_at'
  >[]) {
    dates
      .get(session.group_id)
      ?.add(dayjs(session.starts_at).tz(timezone).format('YYYY-MM-DD'));
  }

  const missingByGroup = await Promise.all(
    uniqueGroupIds.map((groupId) =>
      listMissingUserGroupSessionOccurrences({
        from,
        groupId,
        reconcile: false,
        supabase,
        to,
        wsId,
      })
    )
  );
  for (const missing of missingByGroup.flat()) {
    dates.get(missing.groupId)?.add(missing.date);
  }

  return new Map(
    Array.from(dates, ([groupId, groupDates]) => [
      groupId,
      Array.from(groupDates).sort(),
    ])
  );
}
