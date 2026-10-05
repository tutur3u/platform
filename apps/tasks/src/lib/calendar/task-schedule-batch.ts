import type {
  TaskScheduleBatchResponse,
  TaskScheduleBatchSettings,
} from '@tuturuuu/internal-api/tasks-scheduling';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export class ScheduleBatchError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** Read every page or fail: incomplete event reads must not publish zero minutes. */
async function allRows<T>(
  read: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await read(offset, offset + 499);
    if (result.error)
      throw new ScheduleBatchError(500, 'Failed to read task schedules');
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
  throw new ScheduleBatchError(
    422,
    'Task schedule batch exceeds the event limit'
  );
}

export async function readTaskScheduleBatch({
  supabase,
  admin,
  actorId,
  wsId,
  taskIds,
  personal,
}: {
  supabase: TypedSupabaseClient;
  admin: TypedSupabaseClient;
  actorId: string;
  wsId: string;
  taskIds: string[];
  personal: boolean;
}): Promise<TaskScheduleBatchResponse> {
  // Authenticate calendar context before looking up any private task IDs.
  const { data: contextMember, error: memberError } = await supabase
    .from('workspace_members')
    .select('type')
    .eq('user_id', actorId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (memberError)
    throw new ScheduleBatchError(500, 'Failed to verify workspace access');
  if (contextMember?.type !== 'MEMBER')
    throw new ScheduleBatchError(403, 'Workspace access denied');
  if (personal) {
    const { data, error } = await supabase
      .from('workspaces')
      .select('personal')
      .eq('id', wsId)
      .maybeSingle();
    if (error)
      throw new ScheduleBatchError(500, 'Failed to verify calendar context');
    if (!data?.personal)
      throw new ScheduleBatchError(400, 'Personal calendar required');
  }
  const { data: tasks, error: taskError } = await admin
    .from('tasks')
    .select('id, task_lists!inner(workspace_boards!inner(ws_id))')
    .in('id', taskIds);
  if (taskError)
    throw new ScheduleBatchError(500, 'Failed to read task schedules');
  const taskWorkspaces = new Map(
    (tasks ?? []).flatMap((task) => {
      const id = task.task_lists?.workspace_boards?.ws_id;
      return id ? [[task.id, id] as const] : [];
    })
  );
  const sourceWorkspaces = [...new Set(taskWorkspaces.values())];
  const { data: memberships, error: membershipsError } = sourceWorkspaces.length
    ? await supabase
        .from('workspace_members')
        .select('ws_id, type')
        .eq('user_id', actorId)
        .in('ws_id', sourceWorkspaces)
    : { data: [], error: null };
  if (membershipsError)
    throw new ScheduleBatchError(500, 'Failed to verify task access');
  const allowedWorkspaces = new Set(
    (memberships ?? []).filter((m) => m.type === 'MEMBER').map((m) => m.ws_id)
  );
  const allowedIds = [...taskWorkspaces.keys()].filter((id) =>
    allowedWorkspaces.has(taskWorkspaces.get(id)!)
  );
  const response: TaskScheduleBatchResponse = {
    minutesByTaskId: {},
    settingsByTaskId: {},
  };
  // Missing/denied tasks are indistinguishable and cannot expose their settings.
  for (const id of taskIds) {
    response.minutesByTaskId[id] = 0;
    response.settingsByTaskId[id] = null;
  }
  for (const id of allowedIds)
    response.settingsByTaskId[id] = {
      total_duration: null,
      is_splittable: false,
      min_split_duration_minutes: null,
      max_split_duration_minutes: null,
      calendar_hours: null,
      auto_schedule: false,
    };
  if (!allowedIds.length) return response;
  const calendarIds = personal ? [wsId] : [...allowedWorkspaces];
  const [settings, linked, direct] = await Promise.all([
    supabase
      .from('task_user_scheduling_settings')
      .select(
        'task_id, total_duration, is_splittable, min_split_duration_minutes, max_split_duration_minutes, calendar_hours, auto_schedule'
      )
      .eq('user_id', actorId)
      .in('task_id', allowedIds),
    allRows((from) =>
      admin
        .from('task_calendar_events')
        .select(
          'event_id, task_id, workspace_calendar_events!inner(id, ws_id, start_at, end_at)'
        )
        .in('task_id', allowedIds)
        .in('workspace_calendar_events.ws_id', calendarIds)
        .order('event_id')
        .range(from, from + 499)
    ),
    allRows((from) =>
      admin
        .from('workspace_calendar_events')
        .select('id, task_id, ws_id, start_at, end_at')
        .in('task_id', allowedIds)
        .in('ws_id', calendarIds)
        .order('id')
        .range(from, from + 499)
    ),
  ]);
  if (settings.error)
    throw new ScheduleBatchError(500, 'Failed to read scheduling settings');
  const seen = new Set<string>();
  const add = (
    taskId: string | null,
    event: {
      id: string;
      ws_id: string;
      start_at: string;
      end_at: string;
    } | null
  ) => {
    if (
      !taskId ||
      !event ||
      event.ws_id !== (personal ? wsId : taskWorkspaces.get(taskId))
    )
      return;
    const key = `${taskId}:${event.id}`;
    if (seen.has(key)) return;
    const minutes = Math.round(
      (Date.parse(event.end_at) - Date.parse(event.start_at)) / 60000
    );
    if (!Number.isFinite(minutes) || minutes < 0)
      throw new ScheduleBatchError(500, 'Invalid scheduled event duration');
    seen.add(key);
    response.minutesByTaskId[taskId] =
      (response.minutesByTaskId[taskId] ?? 0) + minutes;
  };
  for (const row of linked) add(row.task_id, row.workspace_calendar_events);
  for (const row of direct) add(row.task_id, row);
  for (const row of settings.data ?? []) {
    const { task_id, ...value } = row;
    response.settingsByTaskId[task_id] = {
      ...value,
      is_splittable: value.is_splittable ?? false,
      auto_schedule: value.auto_schedule ?? false,
    } as TaskScheduleBatchSettings;
  }
  return response;
}
