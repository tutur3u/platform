import '@tanstack/react-start/server-only';
import { attachSupabaseAuthUser } from '@tuturuuu/auth/app-session';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { headers } from '@tuturuuu/start-bridge/next/headers';
import type {
  WorkspaceTaskBoardDetail,
  WorkspaceTasksResponse,
} from '@tuturuuu/internal-api/tasks';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { handleTaskRouteGET } from '@tuturuuu/tasks-api/server/tasks/route';
import { BOARD_LIST_PAGE_SIZE } from '@tuturuuu/tasks-ui/tu-do/shared/board-first-page';
import {
  BOARD_USER_CONFIG_DEFAULTS,
  BOARD_WORKSPACE_CONFIG_IDS,
  type BoardPreferenceSeed,
} from '@tuturuuu/tasks-ui/tu-do/shared/board-preference-seed';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import { abuseSubject } from '@tuturuuu/utils/abuse-protection/abuse-subject';
import { isIPBlockedEdge } from '@tuturuuu/utils/abuse-protection/edge';
import { isIPBlockedReusingRecentClear } from '@tuturuuu/utils/abuse-protection/recent-ip-block';
import { NextRequest } from '@tuturuuu/start-bridge/next/server';
import { readTaskBoardDetail } from '../app/api/v1/workspaces/[wsId]/task-boards/[boardId]/board-detail';
import { readUserSuspension } from '../lib/session-security-lookups';

export type BoardSnapshotBoard = WorkspaceTaskBoardDetail;

export interface BoardSnapshotListPage {
  tasks: NonNullable<WorkspaceTasksResponse['tasks']>;
  count: number | null;
}

export interface BoardSnapshot {
  board: BoardSnapshotBoard;
  /** Absent when no list page could be read. */
  listPages?: Record<string, BoardSnapshotListPage>;
  preferences: BoardPreferenceSeed;
  /** When the reads started (ms), so the browser keeps newer local edits. */
  capturedAt: number;
}

const DENIED_STATUSES = new Set([400, 401, 403, 404]);

async function readFirstListPage(
  auth: { supabase: TypedSupabaseClient; user: SupabaseUser },
  wsId: string,
  boardId: string,
  listId: string
): Promise<BoardSnapshotListPage | null> {
  const url = new URL(
    `/api/v1/workspaces/${encodeURIComponent(wsId)}/tasks`,
    'http://tasks.internal'
  );
  url.searchParams.set('boardId', boardId);
  url.searchParams.set('listId', listId);
  url.searchParams.set('limit', String(BOARD_LIST_PAGE_SIZE));
  url.searchParams.set('offset', '0');
  url.searchParams.set('includeCount', 'true');
  url.searchParams.set('includeRelationshipSummary', 'false');
  try {
    const response = await handleTaskRouteGET(
      new NextRequest(url),
      { params: Promise.resolve({ wsId }) },
      { ...auth, appSession: true }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as WorkspaceTasksResponse;
    return {
      tasks: payload.tasks ?? [],
      count: typeof payload.count === 'number' ? payload.count : null,
    };
  } catch (error) {
    // A column without a snapshot loads its first page in the browser.
    console.warn('Board snapshot list page failed', { listId, error });
    return null;
  }
}

/**
 * Whether the request is blocked or the actor is suspended, as the board and
 * task API routes decide end to end: the API proxy guard's edge block check
 * on the request's abuse subject (where `api_abuse` and Worker-subject
 * blocks live), the wrapper's persistent IP block check, and the suspension
 * check. A direct page load does not pass the proxy guard, so any block from
 * either store denies here. All lookups fail open, as on the API routes.
 */
async function isDeniedBeforeRead(userId: string) {
  const requestHeaders = await headers();
  const ipAddress = extractIPFromHeaders(requestHeaders);
  const [edgeBlock, block, suspension] = await Promise.all([
    isIPBlockedEdge(abuseSubject(requestHeaders, ipAddress)),
    isIPBlockedReusingRecentClear(ipAddress, {
      route: '/[wsId]/boards/[boardId]',
      source: 'tasks-board-page',
    }),
    readUserSuspension(userId),
  ]);
  return Boolean(suspension) || edgeBlock !== null || block !== null;
}

/** Stored values by id, with `null` for ids the user never stored. */
async function readConfigValues(
  ids: readonly string[],
  query: PromiseLike<{
    data: { id: string; value: string | null }[] | null;
    error: unknown;
  }>
): Promise<Record<string, string | null>> {
  try {
    const { data, error } = await query;
    // Unread preferences load in the browser instead.
    if (error || !data) return {};
    const stored = new Map(data.map((row) => [row.id, row.value] as const));
    return Object.fromEntries(ids.map((id) => [id, stored.get(id) ?? null]));
  } catch {
    return {};
  }
}

/**
 * The actor's own board preferences the kanban waits for. Workspace-scoped
 * values are read only for members, as the config route requires.
 */
async function readBoardPreferences(
  admin: TypedSupabaseClient,
  userId: string,
  board: BoardSnapshotBoard
): Promise<BoardPreferenceSeed> {
  const userConfigIds = Object.keys(BOARD_USER_CONFIG_DEFAULTS);
  const [userConfigs, workspaceConfigs] = await Promise.all([
    readConfigValues(
      userConfigIds,
      admin
        .from('user_configs')
        .select('id, value')
        .eq('user_id', userId)
        .in('id', userConfigIds)
    ),
    board.access_type === 'member'
      ? readConfigValues(
          BOARD_WORKSPACE_CONFIG_IDS,
          admin
            .from('user_workspace_configs')
            .select('id, value')
            .eq('user_id', userId)
            .eq('ws_id', board.ws_id)
            .in('id', [...BOARD_WORKSPACE_CONFIG_IDS])
        )
      : Promise.resolve({}),
  ]);
  return { userConfigs, workspaceConfigs };
}

/**
 * Reads a board, the first task page of each of its lists and the board
 * preferences in-process for a verified actor, so the board renders with its tasks in the first response
 * instead of after hydration and one browser request per column.
 *
 * Authorization is the same as the board and task API routes: their handlers
 * run with the admin client bound to the verified actor (the app-session
 * path of `withSessionAuth`), and a suspended actor gets no board.
 * Returns null when the actor may not read the board.
 */
export async function loadBoardSnapshot({
  user,
  wsId,
  boardId,
}: {
  user: SupabaseUser;
  wsId: string;
  boardId: string;
}): Promise<BoardSnapshot | null> {
  const capturedAt = Date.now();
  // The same request-level decisions the API wrapper makes come first: no
  // board data is read for a blocked IP or a suspended actor.
  if (await isDeniedBeforeRead(user.id)) return null;
  const admin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const auth = { supabase: attachSupabaseAuthUser(admin, user), user };

  const boardResponse = await readTaskBoardDetail({ wsId, boardId }, auth);
  if (!boardResponse.ok) {
    if (DENIED_STATUSES.has(boardResponse.status)) return null;
    throw new Error(`Failed to load task board (${boardResponse.status})`);
  }
  const { board } = (await boardResponse.json()) as {
    board: BoardSnapshotBoard;
  };

  const lists = (board.task_lists ?? []).filter((list) => !list.deleted);
  const [pages, preferences] = await Promise.all([
    Promise.all(
      lists.map((list) =>
        readFirstListPage(auth, board.ws_id, board.id, list.id)
      )
    ),
    readBoardPreferences(admin, user.id, board),
  ]);

  const listPages: Record<string, BoardSnapshotListPage> = {};
  lists.forEach((list, index) => {
    const page = pages[index];
    if (page) listPages[list.id] = page;
  });
  // No list read succeeded: send no pages, so the browser keeps its cached
  // copy and the columns load their own, instead of seeding an empty board.
  const anyPageRead = lists.length === 0 || Object.keys(listPages).length > 0;
  return {
    board,
    listPages: anyPageRead ? listPages : undefined,
    preferences,
    capturedAt,
  };
}

/**
 * Starts the board snapshot for the request's actor alongside the workspace
 * guard. The snapshot authorizes the board on its own; `forActor` hands it
 * out only for the actor the guard admitted and otherwise reads again for
 * that actor.
 */
export function startBoardSnapshot(wsId: string, boardId: string) {
  const started = (async () => {
    const user = await getSatelliteAppSessionUser('tasks');
    if (!user?.id) return null;
    return {
      actorId: user.id,
      snapshot: await loadBoardSnapshot({ user, wsId, boardId }),
    };
  })();
  // A guard redirect can settle the page before this read is awaited.
  started.catch(() => {});
  return {
    forActor(scope: { user: SupabaseUser; workspace: { id: string } }) {
      return started.then((early) =>
        early && early.actorId === scope.user.id
          ? early.snapshot
          : loadBoardSnapshot({
              user: scope.user,
              wsId: scope.workspace.id,
              boardId,
            })
      );
    },
  };
}
