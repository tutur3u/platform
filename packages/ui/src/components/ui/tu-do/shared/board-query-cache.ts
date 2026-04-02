import type { QueryClient } from '@tanstack/react-query';
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
