import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type CycleRow = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  creator: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  task_cycle_tasks: { task_id: string }[] | null;
};

const CYCLE_STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const;

function toCycleStatus(value: string | null) {
  if (!value) return null;
  return CYCLE_STATUSES.includes(value as (typeof CYCLE_STATUSES)[number])
    ? (value as (typeof CYCLE_STATUSES)[number])
    : null;
}

/**
 * A workspace's task cycles for the cycles page, newest first. Returns
 * `null` when the query fails. Framework-free: the caller supplies the
 * request-scoped Supabase client and has already checked permissions.
 */
export async function loadTaskCycles(
  supabase: TypedSupabaseClient,
  wsId: string
) {
  const { data, error } = await supabase
    .from('task_cycles')
    .select(
      `
        *,
        creator:users!task_cycles_creator_id_fkey(
          id, display_name, avatar_url
        ),
        task_cycle_tasks(task_id)
      `
    )
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching task cycles:', error);
    return null;
  }

  return ((data as CycleRow[] | null) ?? []).map((cycle) => ({
    id: cycle.id,
    name: cycle.name,
    description: cycle.description,
    status: toCycleStatus(cycle.status),
    start_date: cycle.start_date,
    end_date: cycle.end_date,
    created_at: cycle.created_at,
    creator: cycle.creator,
    tasksCount: cycle.task_cycle_tasks?.length ?? 0,
  }));
}
