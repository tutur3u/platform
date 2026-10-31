import '@tanstack/react-start/server-only';
import {
  getWorkspaceTaskBoard,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from '@tuturuuu/start-bridge/next/headers';
import { notFound, redirect } from '@tuturuuu/start-bridge/next/navigation';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { loadSmartSchedulingTasks } from '@tuturuuu/tasks-ui/calendar/components/load-smart-scheduling-tasks';
import { schedulingTaskTransport } from '@tuturuuu/tasks-ui/calendar/scheduling-task-transport';
import type { TaskProgressView } from '@tuturuuu/tasks-ui/progress/task-progress-page';
import { loadTaskBoardPageModel } from '@tuturuuu/tasks-ui/tu-do/boards/boardId/task-board-page-model';
import { loadTaskCycles } from '@tuturuuu/tasks-ui/tu-do/cycles/task-cycles-page-model';
import { fetchUserWorkspaceCalendarGoogleTokenForClient } from '@tuturuuu/utils/calendar-auth-token';
import { getLettinNotebookReferenceUrl } from '@tuturuuu/utils/lettin-task-reference';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { resolveTaskBoardEntrypoint } from '../lib/tasks/task-board-entrypoint';
import type { TasksWorkspaceModel } from './workspace-model.server';

type Scope = TasksWorkspaceModel;

const PROGRESS_VIEWS = new Set<TaskProgressView>([
  'progress',
  'goals',
  'stats',
  'leaderboards',
  'import',
]);
const FIRST_CLASS_PROGRESS: Partial<Record<TaskProgressView, string>> = {
  goals: 'goals',
  leaderboards: 'leaderboard',
  progress: 'progress',
  stats: 'analytics',
};

export function progressModel(routeWsId: string, view: TaskProgressView) {
  return { kind: 'progress' as const, routeWsId, view };
}

/** `/[wsId]/progress/[view]`: first-class views redirect to their route. */
export function progressViewModel(routeWsId: string, view: string) {
  if (!PROGRESS_VIEWS.has(view as TaskProgressView)) notFound();
  const route = FIRST_CLASS_PROGRESS[view as TaskProgressView];
  if (route) redirect(`/${routeWsId}/${route}`);
  return progressModel(routeWsId, view as TaskProgressView);
}

/** `/[wsId]/boards` and `/[wsId]/tasks`: open the workspace's entry board. */
export async function entrypointRedirect(scope: Scope): Promise<never> {
  const boardId = await resolveTaskBoardEntrypoint(
    scope.workspace.id,
    withForwardedInternalApiAuth(await headers())
  );
  if (!boardId)
    throw new Error('Unable to prepare a task board for this workspace');
  redirect(`/${scope.slug}/boards/${boardId}`);
}

export async function boardModel(scope: Scope, boardId: string) {
  const wsId = scope.workspace.id;
  const snapshot = await loadTaskBoardPageModel({
    boardId,
    user: scope.user,
    auth: withForwardedInternalApiAuth(await headers()),
    getBoard: async (_actor, auth) => {
      try {
        return (await getWorkspaceTaskBoard(wsId, boardId, auth)).board;
      } catch (error) {
        if (
          error instanceof InternalApiError &&
          [400, 401, 403, 404].includes(error.status)
        )
          return null;
        throw error;
      }
    },
    getWorkspace: (id, actor) =>
      getWorkspace(id, { useAdmin: true, user: actor }),
  });
  if (!snapshot) notFound();
  const workspace =
    snapshot.access === 'guest'
      ? { ...snapshot.workspace, joined: false }
      : snapshot.workspace;
  return {
    kind: 'board' as const,
    boardId,
    board: snapshot.board,
    workspace,
    currentUserId: snapshot.currentUserId,
  };
}

export async function calendarModel(scope: Scope) {
  const { workspace, user } = scope;
  const permissions = await getPermissions({ user, wsId: workspace.id });
  if (!permissions || permissions.withoutPermission('manage_calendar'))
    notFound();
  const admin = await createAdminClient({ noCookie: true });
  const [googleToken, smartSchedulingTasks, connections] = await Promise.all([
    fetchUserWorkspaceCalendarGoogleTokenForClient(admin, {
      wsId: workspace.id,
      userId: user.id,
    }),
    loadSmartSchedulingTasks({ resolvedWsId: workspace.id, userId: user.id }),
    admin
      .from('calendar_connections')
      .select('*')
      .eq('ws_id', workspace.id)
      .order('created_at', { ascending: true }),
  ]);
  return {
    kind: 'calendar' as const,
    calendarConnections: connections.data ?? [],
    googleToken,
    smartSchedulingTasks: smartSchedulingTasks.map(schedulingTaskTransport),
    userId: user.id,
    workspace,
  };
}

export async function cyclesModel(scope: Scope) {
  const wsId = scope.workspace.id;
  const permissions = await getPermissions({ user: scope.user, wsId });
  if (!permissions) notFound();
  if (permissions.withoutPermission('manage_projects')) redirect(`/${wsId}`);
  const cycles = await loadTaskCycles(
    await createAdminClient({ noCookie: true }),
    wsId
  );
  if (!cycles) notFound();
  return { kind: 'cycles' as const, wsId, cycles };
}

export function newTaskModel(
  scope: Scope,
  routeWsId: string,
  locale: string,
  search: URLSearchParams
) {
  const world = search.getAll('lettinWorld');
  const entry = search.getAll('lettinEntry');
  let sourceUrl: string | undefined;
  if (world.length > 0 || entry.length > 0) {
    if (world.length !== 1 || entry.length > 1) notFound();
    const url = getLettinNotebookReferenceUrl({
      workspaceId: scope.workspace.id,
      locale,
      worldId: world[0] as string,
      entryId: entry[0],
    });
    if (!url) notFound();
    sourceUrl = url;
  }
  return {
    kind: 'new-task' as const,
    wsId: scope.workspace.id,
    routeWsId,
    sourceUrl,
  };
}

/** `/[wsId]/tasks/boards/[boardId]` keeps its query on the canonical board. */
export function legacyBoardRedirect(
  routeWsId: string,
  boardId: string,
  search: URLSearchParams
): never {
  const query = search.toString();
  redirect(`/${routeWsId}/boards/${boardId}${query ? `?${query}` : ''}`);
}
