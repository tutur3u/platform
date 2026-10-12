import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getTaskReminderLifecycleSkipReason } from '@tuturuuu/utils/task-reminder-lifecycle';
import { z } from 'zod';

type ReminderCandidate = {
  type?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  ws_id?: string | null;
  user_id?: string | null;
  scope?: string | null;
  data?: unknown;
};

const Payload = z.object({
  task_id: z.string().min(1),
  end_date: z.string().min(1),
});
const CurrentTask = z.object({
  id: z.string(),
  end_date: z.string().nullable(),
  completed_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  task_lists: z.object({
    status: z.string().nullable(),
    workspace_boards: z.object({ ws_id: z.string() }),
  }),
  task_watchers: z.array(z.object({ user_id: z.string() })),
});

/** Unknown lookup/binding remains retryable; only confirmed cancellation is skipped. */
export async function getTaskReminderSkipReason(
  sbAdmin: Pick<TypedSupabaseClient, 'from'>,
  notification: ReminderCandidate
): Promise<string | null> {
  if (notification.type !== 'deadline_reminder') return null;
  const payload = Payload.safeParse(notification.data);
  if (
    notification.entity_type !== 'task' ||
    notification.scope !== 'workspace' ||
    !notification.entity_id ||
    !notification.ws_id ||
    !notification.user_id ||
    !payload.success ||
    payload.data.task_id !== notification.entity_id
  ) {
    throw new Error('Task reminder binding unavailable');
  }
  const { data, error } = await sbAdmin
    .from('tasks')
    .select(
      'id, end_date, completed_at, closed_at, deleted_at, task_lists!inner(status, workspace_boards!inner(ws_id)), task_watchers(user_id)'
    )
    .eq('id', notification.entity_id)
    .eq('task_lists.workspace_boards.ws_id', notification.ws_id)
    .maybeSingle();
  if (error) throw new Error('Current task reminder unavailable');
  if (data === null) return 'skipped: task_reminder_canceled';
  const current = CurrentTask.safeParse(data);
  if (
    !current.success ||
    current.data.id !== notification.entity_id ||
    current.data.task_lists.workspace_boards.ws_id !== notification.ws_id
  ) {
    throw new Error('Current task reminder unavailable');
  }
  return getTaskReminderLifecycleSkipReason(
    {
      ...current.data,
      listStatus: current.data.task_lists.status,
      recipientWatching: current.data.task_watchers.some(
        (watcher) => watcher.user_id === notification.user_id
      ),
    },
    payload.data.end_date
  );
}
