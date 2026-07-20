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

async function resolveExistingBoardId(
  workspaceId: string,
  internalApiOptions: InternalApiClientOptions
) {
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

  try {
    const { value } = await getUserWorkspaceConfig(
      workspaceId,
      TASK_DEFAULT_BOARD_ID_CONFIG_ID,
      internalApiOptions
    );

    if (value && boards.some((board) => board.id === value)) {
      return value;
    }
  } catch {
    return firstBoardId;
  }

  return firstBoardId;
}

async function renameDefaultLists(
  workspaceId: string,
  boardId: string,
  internalApiOptions: InternalApiClientOptions
) {
  const t = await getTranslations();
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

export async function resolveTaskBoardEntrypoint(
  workspaceId: string,
  internalApiOptions: InternalApiClientOptions
) {
  const existingBoardId = await resolveExistingBoardId(
    workspaceId,
    internalApiOptions
  );

  if (existingBoardId) return existingBoardId;

  try {
    const t = await getTranslations();
    const { board } = await createWorkspaceTaskBoard(
      workspaceId,
      {
        name: t('ws-tasks.default_board_name'),
      },
      internalApiOptions
    );

    if (!board?.id) return null;

    await renameDefaultLists(workspaceId, board.id, internalApiOptions);

    return board.id;
  } catch {
    return resolveExistingBoardId(workspaceId, internalApiOptions);
  }
}
