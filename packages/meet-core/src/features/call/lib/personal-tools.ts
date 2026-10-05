import { listWorkspaceCalendarEvents } from '@tuturuuu/internal-api/calendar';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { getUserTaskDashboard } from '@tuturuuu/internal-api/tasks-dashboard';
import { getCurrentUserProfile } from '@tuturuuu/internal-api/users';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';

export const personalToolsApi = {
  profile: getCurrentUserProfile,
  workspaces: listWorkspaces,
  tasks: getUserTaskDashboard,
  calendar: listWorkspaceCalendarEvents,
};

export interface PersonalToolsSnapshot {
  actorId: string;
  workspace: Awaited<ReturnType<typeof listWorkspaces>>[number];
  tasks: Awaited<ReturnType<typeof getUserTaskDashboard>> | null;
  events:
    | Awaited<ReturnType<typeof listWorkspaceCalendarEvents>>['data']
    | null;
  tasksStatus: 'ready' | 'stale' | 'unavailable';
  calendarStatus: 'ready' | 'stale' | 'unavailable';
}

/** Local actor-only reads: no meeting ID, room workspace, or broadcast dependency. */
export async function loadPersonalTools(
  actorId: string,
  api = personalToolsApi,
  now = new Date(),
  previous?: PersonalToolsSnapshot | null
): Promise<PersonalToolsSnapshot | null> {
  const profile = await api.profile();
  if (profile.id !== actorId) throw new Error('personal_tools_actor_changed');
  const workspace = (await api.workspaces()).find((item) => item.personal);
  if (!workspace) return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const [tasks, calendar] = await Promise.allSettled([
    api.tasks({ wsId: workspace.id, isPersonal: true }),
    api.calendar(workspace.id, {
      start_at: start.toISOString(),
      end_at: end.toISOString(),
    }),
  ]);
  if ((await api.profile()).id !== actorId)
    throw new Error('personal_tools_actor_changed');
  const retained =
    previous?.actorId === actorId && previous.workspace.id === workspace.id
      ? previous
      : null;
  const keepTasks =
    tasks.status === 'rejected' &&
    personalToolsFailureKeepsSnapshot(tasks.reason) &&
    retained?.tasks != null;
  const keepCalendar =
    calendar.status === 'rejected' &&
    personalToolsFailureKeepsSnapshot(calendar.reason) &&
    retained?.events != null;
  return {
    actorId,
    workspace,
    tasks:
      tasks.status === 'fulfilled'
        ? tasks.value
        : keepTasks
          ? retained!.tasks
          : null,
    events:
      calendar.status === 'fulfilled'
        ? calendar.value.data
        : keepCalendar
          ? retained!.events
          : null,
    tasksStatus:
      tasks.status === 'fulfilled'
        ? 'ready'
        : keepTasks
          ? 'stale'
          : 'unavailable',
    calendarStatus:
      calendar.status === 'fulfilled'
        ? 'ready'
        : keepCalendar
          ? 'stale'
          : 'unavailable',
  };
}

/** Keep an actor-scoped authorized snapshot only across temporary availability failures. */
export function personalToolsFailureKeepsSnapshot(error: unknown) {
  return (
    (error instanceof TypeError &&
      /^(Failed to fetch|Load failed|fetch failed|NetworkError when attempting to fetch resource\.?)$/i.test(
        error.message
      )) ||
    (error instanceof InternalApiError &&
      (error.status >= 500 || error.status === 429))
  );
}
