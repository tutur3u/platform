import { listWorkspaceCalendarEvents } from '@tuturuuu/internal-api/calendar';
import {
  type ChatConversation,
  listWorkspaceChatConversations,
} from '@tuturuuu/internal-api/chat';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { getWorkspaceMeetings } from '@tuturuuu/internal-api/meetings';
import {
  listWorkspaceStorageObjects,
  type WorkspaceStorageListItem,
} from '@tuturuuu/internal-api/storage';
import { getUserTaskDashboard } from '@tuturuuu/internal-api/tasks';
import { getCurrentUserProfile } from '@tuturuuu/internal-api/users';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';

export interface PersonalMeetingItem {
  id: string;
  name: string;
  time: string | null;
  created_at: string;
  creator_id: string;
  calendar_event?: { id: string; start_at: string; end_at: string } | null;
}

export interface PersonalMeetingsPage {
  meetings: PersonalMeetingItem[];
  totalCount: number;
}

export type PersonalToolsTab =
  | 'tasks'
  | 'calendar'
  | 'meetings'
  | 'chat'
  | 'drive';

export type PersonalToolStatus = 'ready' | 'stale' | 'unavailable';

export const personalToolsApi = {
  profile: getCurrentUserProfile,
  workspaces: listWorkspaces,
  tasks: getUserTaskDashboard,
  calendar: listWorkspaceCalendarEvents,
  meetings: (
    wsId: string,
    query: { page: number; pageSize: number; search?: string }
  ) => getWorkspaceMeetings<PersonalMeetingsPage>(wsId, query),
  chat: listWorkspaceChatConversations,
  drive: listWorkspaceStorageObjects,
};

export type PersonalToolsApi = typeof personalToolsApi;

export interface PersonalToolsSnapshot {
  actorId: string;
  workspace: Awaited<ReturnType<typeof listWorkspaces>>[number];
  tasks: Awaited<ReturnType<typeof getUserTaskDashboard>> | null;
  events:
    | Awaited<ReturnType<typeof listWorkspaceCalendarEvents>>['data']
    | null;
  tasksStatus: PersonalToolStatus;
  calendarStatus: PersonalToolStatus;
}

export interface PersonalTabSnapshot<T> {
  actorId: string;
  workspaceId: string;
  items: T | null;
  status: PersonalToolStatus;
}

function isActorChangedError(error: unknown) {
  return (
    error instanceof Error && error.message === 'personal_tools_actor_changed'
  );
}

function isPersonalToolsAuthOrMissingError(error: unknown) {
  return (
    error instanceof InternalApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  );
}

async function assertPersonalToolsActor(
  actorId: string,
  api: Pick<PersonalToolsApi, 'profile'>
) {
  const profile = await api.profile();
  if (profile.id !== actorId) throw new Error('personal_tools_actor_changed');
}

/** Local actor-only reads: no meeting ID, room workspace, or broadcast dependency. */
export async function loadPersonalTools(
  actorId: string,
  api: Pick<
    PersonalToolsApi,
    'profile' | 'workspaces' | 'tasks' | 'calendar'
  > = personalToolsApi,
  now = new Date(),
  previous?: PersonalToolsSnapshot | null
): Promise<PersonalToolsSnapshot | null> {
  await assertPersonalToolsActor(actorId, api);
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
  await assertPersonalToolsActor(actorId, api);
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

/** Lazy per-tab loader: actor-verified before and after read, fail-closed on denial. */
async function loadPersonalTabItems<T>(
  actorId: string,
  workspaceId: string,
  api: Pick<PersonalToolsApi, 'profile'>,
  read: () => Promise<T>,
  previous?: PersonalTabSnapshot<T> | null
): Promise<PersonalTabSnapshot<T>> {
  const unavailable: PersonalTabSnapshot<T> = {
    actorId,
    workspaceId,
    items: null,
    status: 'unavailable',
  };
  try {
    await assertPersonalToolsActor(actorId, api);
  } catch (error) {
    if (isPersonalToolsAuthOrMissingError(error)) return unavailable;
    throw error;
  }
  const retained =
    previous?.actorId === actorId && previous.workspaceId === workspaceId
      ? previous
      : null;
  let result: PromiseSettledResult<T>;
  try {
    result = { status: 'fulfilled', value: await read() };
  } catch (reason) {
    result = { status: 'rejected', reason };
  }
  if (
    result.status === 'rejected' &&
    !personalToolsFailureKeepsSnapshot(result.reason)
  ) {
    try {
      await assertPersonalToolsActor(actorId, api);
    } catch (error) {
      if (isActorChangedError(error)) throw error;
    }
    return unavailable;
  }
  try {
    await assertPersonalToolsActor(actorId, api);
  } catch (error) {
    if (isPersonalToolsAuthOrMissingError(error)) return unavailable;
    throw error;
  }
  if (result.status === 'fulfilled') {
    return {
      actorId,
      workspaceId,
      items: result.value,
      status: 'ready',
    };
  }
  const keepPrevious = retained?.items != null;
  return {
    actorId,
    workspaceId,
    items: keepPrevious ? retained!.items : null,
    status: keepPrevious ? 'stale' : 'unavailable',
  };
}

export function loadPersonalMeetings(
  actorId: string,
  workspaceId: string,
  api: Pick<PersonalToolsApi, 'profile' | 'meetings'> = personalToolsApi,
  previous?: PersonalTabSnapshot<PersonalMeetingItem[]> | null
): Promise<PersonalTabSnapshot<PersonalMeetingItem[]>> {
  return loadPersonalTabItems(
    actorId,
    workspaceId,
    api,
    async () => {
      const page = await api.meetings(workspaceId, { page: 1, pageSize: 20 });
      return page.meetings ?? [];
    },
    previous
  );
}

export function loadPersonalChat(
  actorId: string,
  workspaceId: string,
  api: Pick<PersonalToolsApi, 'profile' | 'chat'> = personalToolsApi,
  previous?: PersonalTabSnapshot<ChatConversation[]> | null
): Promise<PersonalTabSnapshot<ChatConversation[]>> {
  return loadPersonalTabItems(
    actorId,
    workspaceId,
    api,
    () => api.chat(workspaceId, { archived: 'active', limit: 25 }),
    previous
  );
}

export function loadPersonalDrive(
  actorId: string,
  workspaceId: string,
  api: Pick<PersonalToolsApi, 'profile' | 'drive'> = personalToolsApi,
  previous?: PersonalTabSnapshot<WorkspaceStorageListItem[]> | null
): Promise<PersonalTabSnapshot<WorkspaceStorageListItem[]>> {
  return loadPersonalTabItems(
    actorId,
    workspaceId,
    api,
    async () => {
      const res = await api.drive(workspaceId, {
        limit: 25,
        sortBy: 'updated_at',
        sortOrder: 'desc',
      });
      return res.data ?? [];
    },
    previous
  );
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
