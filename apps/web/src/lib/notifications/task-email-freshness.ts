import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export const TASK_EMAIL_MAX_OVERDUE_MS = 24 * 60 * 60 * 1000;
export const TASK_EMAIL_UNAVAILABLE_SKIP_REASON = 'skipped: task_unavailable';
export const TASK_EMAIL_OVERDUE_SKIP_REASON =
  'skipped: task_due_older_than_1_day';

export type TaskEmailNotification = {
  entity_type?: string | null;
  entity_id?: string | null;
  ws_id?: string | null;
  data?: unknown;
};

/** Eligibility uses the current task, never the queued due-date snapshot. */
export async function getTaskEmailSkipReason(
  sbAdmin: Pick<TypedSupabaseClient, 'from'>,
  notification: TaskEmailNotification,
  now = Date.now()
): Promise<string | null> {
  if (notification.entity_type !== 'task') return null;
  const taskId = notification.entity_id;
  const workspaceId = notification.ws_id;
  const data = notification.data;
  const payloadTaskId =
    data && typeof data === 'object' && 'task_id' in data
      ? data.task_id
      : undefined;
  if (
    !taskId ||
    !workspaceId ||
    (payloadTaskId !== undefined && payloadTaskId !== taskId)
  ) {
    throw new Error('Task email notification binding unavailable');
  }

  const { data: task, error } = await sbAdmin
    .from('tasks')
    .select('id, end_date, task_lists!inner(workspace_boards!inner(ws_id))')
    .eq('id', taskId)
    .eq('task_lists.workspace_boards.ws_id', workspaceId)
    .maybeSingle();
  if (error) throw new Error('Current task email due date unavailable');
  if (task === null) return TASK_EMAIL_UNAVAILABLE_SKIP_REASON;
  if (
    !task ||
    task.id !== taskId ||
    task.task_lists?.workspace_boards?.ws_id !== workspaceId
  ) {
    throw new Error('Current task email due date unavailable');
  }
  if (task.end_date === null) return null;
  const dueAt = Date.parse(task.end_date);
  if (!Number.isFinite(dueAt) || !Number.isFinite(now)) {
    throw new Error('Current task email due date invalid');
  }
  return dueAt < now - TASK_EMAIL_MAX_OVERDUE_MS
    ? TASK_EMAIL_OVERDUE_SKIP_REASON
    : null;
}
