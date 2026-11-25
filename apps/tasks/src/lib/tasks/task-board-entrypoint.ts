import {
  createWorkspaceTaskBoard,
  getUserWorkspaceConfig,
  type InternalApiClientOptions,
  listWorkspaceTaskBoards,
  listWorkspaceTaskLists,
  TASK_DEFAULT_BOARD_ID_CONFIG_ID,
  updateWorkspaceTaskList,
} from '@tuturuuu/internal-api';
import { getTranslations } from 'next-intl/server';

const DEFAULT_LIST_NAME_KEYS: Record<string, string> = {
  'To Do': 'ws-tasks.default_list_todo',
  'In Progress': 'ws-tasks.default_list_in_progress',
  Done: 'ws-tasks.default_list_done',
  Closed: 'ws-tasks.default_list_closed',
};

interface ResolveTaskBoardEntrypointOptions {
  locale?: string;
}

function getTaskTranslations(locale?: string) {
  return locale ? getTranslations({ locale }) : getTranslations();
}

async function resolveExistingBoardId(
  workspaceId: string,
  internalApiOptions: InternalApiClientOptions
) {
  // The preferred-board read does not depend on the board list, so both run
  // together. An unreadable preference falls back to the first board.
  const preferredBoardId = getUserWorkspaceConfig(
    workspaceId,
    TASK_DEFAULT_BOARD_ID_CONFIG_ID,
    internalApiOptions
  )
    .then((config) => config?.value ?? null)
    .catch(() => null);
  // The task-boards endpoint repairs a missing personal default board before
  // returning. New accounts therefore get a usable board in the same request
  // instead of bouncing between `/personal/tasks` and the app root.
  const { boards } = await listWorkspaceTaskBoards(
    workspaceId,
    { status: 'active' },
    internalApiOptions
  );
  const firstBoardId = boards[0]?.id ?? null;

  if (!firstBoardId) return null;

  const value = await preferredBoardId;
  return value && boards.some((board) => board.id === value)
    ? value
    : firstBoardId;
}

async function resolveBoardAfterCreateRace(
  workspaceId: string,
  internalApiOptions: InternalApiClientOptions
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const boardId = await resolveExistingBoardId(
      workspaceId,
      internalApiOptions
    );
    if (boardId) return boardId;

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
    }
  }

  return null;
}

async function renameDefaultLists(
  workspaceId: string,
  boardId: string,
  internalApiOptions: InternalApiClientOptions,
  locale?: string
) {
  const t = await getTaskTranslations(locale);
  const { lists } = await listWorkspaceTaskLists(
    workspaceId,
    boardId,
    internalApiOptions
  );

  await Promise.all(
    (lists ?? [])
      .filter((list) => list.name && DEFAULT_LIST_NAME_KEYS[list.name])
      .map((list) =>
        updateWorkspaceTaskList(
          workspaceId,
          boardId,
          list.id,
          {
            name: t(DEFAULT_LIST_NAME_KEYS[list.name!]!),
          },
          internalApiOptions
        )
      )
  );
}

async function resolveTaskBoardEntrypointOnce(
  workspaceId: string,
  internalApiOptions: InternalApiClientOptions,
  options: ResolveTaskBoardEntrypointOptions
) {
  const existingBoardId = await resolveExistingBoardId(
    workspaceId,
    internalApiOptions
  );

  if (existingBoardId) return existingBoardId;

  try {
    const t = await getTaskTranslations(options.locale);
    const { board } = await createWorkspaceTaskBoard(
      workspaceId,
      {
        name: t('ws-tasks.default_board_name'),
      },
      internalApiOptions
    );

    if (!board?.id) {
      return resolveBoardAfterCreateRace(workspaceId, internalApiOptions);
    }

    await renameDefaultLists(
      workspaceId,
      board.id,
      internalApiOptions,
      options.locale
    );

    return board.id;
  } catch {
    // Concurrent navigations can both observe an empty workspace and race to
    // create the default board. The unique constraint chooses one winner; give
    // its transaction a brief window to become visible before falling home.
    return resolveBoardAfterCreateRace(workspaceId, internalApiOptions);
  }
}

/**
 * Resolves the board a Tasks entry route should open for the calling user.
 *
 * Every step is scoped to the caller: the forwarded credentials, the user's
 * default-board preference and the locale used to name a new default board.
 * Resolutions are therefore never shared between concurrent requests. When
 * two requests race to create a workspace's first board, the per-workspace
 * unique board name lets one create win and the other recovers it in
 * `resolveBoardAfterCreateRace`.
 */
export function resolveTaskBoardEntrypoint(
  workspaceId: string,
  internalApiOptions: InternalApiClientOptions,
  options: ResolveTaskBoardEntrypointOptions = {}
) {
  return resolveTaskBoardEntrypointOnce(
    workspaceId,
    internalApiOptions,
    options
  );
}
