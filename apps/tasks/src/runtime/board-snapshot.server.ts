import '@tanstack/react-start/server-only';
import { attachSupabaseAuthUser } from '@tuturuuu/auth/app-session';
import type { WorkspaceTasksResponse } from '@tuturuuu/internal-api';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { handleTaskRouteGET } from '@tuturuuu/tasks-api/server/tasks/route';
import {
  BOARD_USER_CONFIG_DEFAULTS,
  BOARD_WORKSPACE_CONFIG_IDS,
  type BoardPreferenceSeed,
} from '@tuturuuu/tasks-ui/tu-do/shared/board-preference-seed';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { checkUserSuspension } from '@tuturuuu/utils/abuse-protection/user-suspension';
import { NextRequest } from '@tuturuuu/start-bridge/next/server';
import { readTaskBoardDetail } from '../app/api/v1/workspaces/[wsId]/task-boards/[boardId]/board-detail';

/** Matches the board column's first progressive page. */
export const BOARD_SNAPSHOT_PAGE_SIZE = 50;

export type BoardSnapshotBoard = WorkspaceTaskBoard & {
  access_type?: 'member' | 'guest';
  task_lists?: { id: string; deleted?: boolean | null }[];
};

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

async function isSuspended(userId: string) {
  try {
    return (await checkUserSuspension(userId)).suspended;
  } catch {
    // The API wrapper fails open when the suspension lookup is unavailable.
    return false;
  }
}

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
  url.searchParams.set('limit', String(BOARD_SNAPSHOT_PAGE_SIZE));
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
  const suspended = isSuspended(user.id);
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
  const [pages, preferences, isActorSuspended] = await Promise.all([
    Promise.all(
      lists.map((list) =>
        readFirstListPage(auth, board.ws_id, board.id, list.id)
      )
    ),
    readBoardPreferences(admin, user.id, board),
    suspended,
  ]);
  if (isActorSuspended) return null;

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
