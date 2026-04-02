import { QueryClient } from '@tanstack/react-query';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { BoardConfig } from '@tuturuuu/utils/task-helper';
import { describe, expect, it } from 'vitest';
import { syncBoardTicketPrefixCaches } from '../board-query-cache';

describe('syncBoardTicketPrefixCaches', () => {
  it('updates the live board and board config caches with the new prefix', () => {
    const queryClient = new QueryClient();
    const board = {
      id: 'board-1',
      ws_id: 'ws-1',
    } satisfies Pick<WorkspaceTaskBoard, 'id'> & {
      ws_id?: WorkspaceTaskBoard['ws_id'] | null;
    };

    queryClient.setQueryData(['task-board', 'ws-1', 'board-1'], {
      id: 'board-1',
      ticket_prefix: 'OLD',
    } satisfies Partial<WorkspaceTaskBoard>);

    queryClient.setQueryData(['board-config', 'ws-1', 'board-1'], {
      id: 'board-1',
      ws_id: 'ws-1',
      estimation_type: 'fibonacci',
      extended_estimation: true,
      allow_zero_estimates: true,
      ticket_prefix: 'OLD',
    } satisfies BoardConfig);

    syncBoardTicketPrefixCaches({
      queryClient,
      workspaceId: 'ws-1',
      board,
      ticketPrefix: 'NEW',
    });

    expect(
      queryClient.getQueryData<Partial<WorkspaceTaskBoard>>([
        'task-board',
        'ws-1',
        'board-1',
      ])
    ).toMatchObject({
      id: 'board-1',
      ticket_prefix: 'NEW',
    });

    expect(
      queryClient.getQueryData<BoardConfig>(['board-config', 'ws-1', 'board-1'])
    ).toMatchObject({
      id: 'board-1',
      ticket_prefix: 'NEW',
      estimation_type: 'fibonacci',
      extended_estimation: true,
      allow_zero_estimates: true,
    });
  });

  it('seeds a minimal board config cache when it has not been fetched yet', () => {
    const queryClient = new QueryClient();

    syncBoardTicketPrefixCaches({
      queryClient,
      workspaceId: 'ws-1',
      board: {
        id: 'board-1',
        ws_id: null,
      },
      ticketPrefix: 'DEV',
    });

    expect(
      queryClient.getQueryData<BoardConfig>(['board-config', 'ws-1', 'board-1'])
    ).toEqual({
      id: 'board-1',
      ws_id: 'ws-1',
      estimation_type: null,
      extended_estimation: false,
      allow_zero_estimates: false,
      ticket_prefix: 'DEV',
    });
  });
});
