import type { QueryClient } from '@tanstack/react-query';
import type { WorkspaceTaskBoardEstimationConfig } from '@tuturuuu/internal-api';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { BoardConfig } from '@tuturuuu/utils/task-helper';

interface SyncBoardTicketPrefixCachesParams {
  queryClient: QueryClient;
  workspaceId: string;
  board: Pick<WorkspaceTaskBoard, 'id'> & {
    ws_id?: WorkspaceTaskBoard['ws_id'] | null;
  };
  ticketPrefix: string | null;
}

export function syncBoardTicketPrefixCaches({
  queryClient,
  workspaceId,
  board,
  ticketPrefix,
}: SyncBoardTicketPrefixCachesParams) {
  queryClient.setQueryData(
    ['task-board', workspaceId, board.id],
    (currentBoard: WorkspaceTaskBoard | undefined) =>
      currentBoard
        ? {
            ...currentBoard,
            ticket_prefix: ticketPrefix,
          }
        : currentBoard
  );

  queryClient.setQueryData(
    ['board-config', workspaceId, board.id],
    (currentConfig: BoardConfig | null | undefined) =>
      currentConfig
        ? {
            ...currentConfig,
            ticket_prefix: ticketPrefix,
          }
        : {
            id: board.id,
            ws_id: board.ws_id ?? workspaceId,
            estimation_type: null,
            extended_estimation: false,
            allow_zero_estimates: false,
            ticket_prefix: ticketPrefix,
          }
  );
}

interface SyncBoardEstimationCachesParams {
  queryClient: QueryClient;
  workspaceId: string;
  boardId: string;
  boardName: string;
  board: WorkspaceTaskBoardEstimationConfig;
}

export function syncBoardEstimationCaches({
  queryClient,
  workspaceId,
  boardId,
  boardName,
  board,
}: SyncBoardEstimationCachesParams) {
  const estimationConfig = {
    estimation_type: board.estimation_type ?? null,
    extended_estimation: board.extended_estimation ?? false,
    allow_zero_estimates: board.allow_zero_estimates ?? false,
  };

  queryClient.setQueryData(
    ['board-config', workspaceId, boardId],
    (currentConfig: BoardConfig | null | undefined) =>
      currentConfig
        ? {
            ...currentConfig,
            ...estimationConfig,
          }
        : {
            id: boardId,
            ws_id: workspaceId,
            ticket_prefix: null,
            ...estimationConfig,
          }
  );

  queryClient.setQueryData(
    ['board-estimation-config', workspaceId, boardId],
    (
      currentConfig:
        | (Pick<
            WorkspaceTaskBoard,
            | 'id'
            | 'name'
            | 'estimation_type'
            | 'extended_estimation'
            | 'allow_zero_estimates'
          > & {
            count_unestimated_issues?: boolean | null;
          })
        | null
        | undefined
    ) => ({
      ...(currentConfig ?? {}),
      id: board.id,
      name: board.name ?? currentConfig?.name ?? boardName,
      ...estimationConfig,
      count_unestimated_issues:
        board.count_unestimated_issues ??
        currentConfig?.count_unestimated_issues ??
        false,
    })
  );

  queryClient.setQueryData(
    ['task-board', workspaceId, boardId],
    (currentBoard: Partial<WorkspaceTaskBoard> | undefined) =>
      currentBoard
        ? {
            ...currentBoard,
            name: board.name ?? currentBoard.name,
            ...estimationConfig,
            count_unestimated_issues:
              board.count_unestimated_issues ??
              currentBoard.count_unestimated_issues,
          }
        : currentBoard
  );

  queryClient.setQueryData(
    ['task-estimate-boards', workspaceId],
    (
      current:
        | {
            boards: Partial<WorkspaceTaskBoard>[];
          }
        | undefined
    ) =>
      current
        ? {
            boards: current.boards.map((currentBoard) =>
              currentBoard.id === boardId
                ? {
                    ...currentBoard,
                    name: board.name ?? currentBoard.name,
                    ...estimationConfig,
                    count_unestimated_issues:
                      board.count_unestimated_issues ??
                      currentBoard.count_unestimated_issues,
                  }
                : currentBoard
            ),
          }
        : current
  );
}
