import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { listLmsClasses } from './lms-class-catalog';
import type { LmsLearnerScope } from './lms-learning-access';
import type { LmsStaffScope } from './lms-staff-access';

type ScheduleRow = Pick<
  Database['private']['Tables']['workspace_user_group_sessions']['Row'],
  | 'id'
  | 'title'
  | 'starts_at'
  | 'ends_at'
  | 'start_timezone'
  | 'end_timezone'
  | 'status'
  | 'updated_at'
>;

export async function listLmsClassSchedule({
  db,
  wsId,
  scope,
  classId,
  from,
  to,
  updatedSince,
  after,
  limit,
}: {
  db: TypedSupabaseClient;
  wsId: string;
  scope: LmsLearnerScope | LmsStaffScope;
  classId: string;
  from: string;
  to: string;
  updatedSince?: string;
  after?: { startsAt: string; id: string };
  limit: number;
}): Promise<ScheduleRow[] | null> {
  const classes = await listLmsClasses({ classId, db, wsId, scope, limit: 1 });
  if (classes.length === 0) return null;

  const query = db
    .schema('private')
    .from('workspace_user_group_sessions')
    .select(
      'id, title, starts_at, ends_at, start_timezone, end_timezone, status, updated_at'
    )
    .eq('ws_id', wsId)
    .eq('group_id', classId)
    .gte('starts_at', from)
    .lt('starts_at', to)
    .order('starts_at')
    .order('id')
    .limit(limit);

  if (updatedSince) query.gte('updated_at', updatedSince);
  if (after) {
    query.or(
      `starts_at.gt.${after.startsAt},and(starts_at.eq.${after.startsAt},id.gt.${after.id})`
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
