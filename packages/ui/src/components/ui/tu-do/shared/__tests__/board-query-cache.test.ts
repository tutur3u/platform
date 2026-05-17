import { QueryClient } from '@tanstack/react-query';
import type { WorkspaceTaskBoardEstimationConfig } from '@tuturuuu/internal-api';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { BoardConfig } from '@tuturuuu/utils/task-helper';
import { describe, expect, it } from 'vitest';
import {
  syncBoardEstimationCaches,
  syncBoardTicketPrefixCaches,
} from '../board-query-cache';

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

describe('syncBoardEstimationCaches', () => {
  it('updates every estimation config cache used by task dialogs and board menus', () => {
    const queryClient = new QueryClient();
    const board = {
      id: 'board-1',
      name: 'Planning',
      estimation_type: 't-shirt',
      extended_estimation: true,
      allow_zero_estimates: true,
      count_unestimated_issues: false,
      created_at: '2026-05-17T00:00:00.000Z',
    } satisfies WorkspaceTaskBoardEstimationConfig;

    queryClient.setQueryData(['board-config', 'ws-1', 'board-1'], {
      id: 'board-1',
      ws_id: 'ws-1',
      ticket_prefix: 'PLAN',
      estimation_type: null,
      extended_estimation: false,
      allow_zero_estimates: false,
    } satisfies BoardConfig);

    queryClient.setQueryData(['board-estimation-config', 'ws-1', 'board-1'], {
      id: 'board-1',
      name: 'Planning',
      estimation_type: null,
      extended_estimation: false,
      allow_zero_estimates: false,
    });

    queryClient.setQueryData(['task-board', 'ws-1', 'board-1'], {
      id: 'board-1',
      estimation_type: null,
      extended_estimation: false,
      allow_zero_estimates: false,
    } satisfies Partial<WorkspaceTaskBoard>);

    queryClient.setQueryData(['task-estimate-boards', 'ws-1'], {
      boards: [
        {
          id: 'board-1',
          estimation_type: null,
          extended_estimation: false,
          allow_zero_estimates: false,
        },
      ],
    });

    syncBoardEstimationCaches({
      queryClient,
      workspaceId: 'ws-1',
      boardId: 'board-1',
      boardName: 'Planning',
      board,
    });

    expect(
      queryClient.getQueryData<BoardConfig>(['board-config', 'ws-1', 'board-1'])
    ).toMatchObject({
      estimation_type: 't-shirt',
      extended_estimation: true,
      allow_zero_estimates: true,
      ticket_prefix: 'PLAN',
    });

    expect(
      queryClient.getQueryData(['board-estimation-config', 'ws-1', 'board-1'])
    ).toMatchObject({
      estimation_type: 't-shirt',
      extended_estimation: true,
      allow_zero_estimates: true,
    });

    expect(
      queryClient.getQueryData<Partial<WorkspaceTaskBoard>>([
        'task-board',
        'ws-1',
        'board-1',
      ])
    ).toMatchObject({
      estimation_type: 't-shirt',
      extended_estimation: true,
      allow_zero_estimates: true,
    });

    expect(
      queryClient.getQueryData(['task-estimate-boards', 'ws-1'])
    ).toMatchObject({
      boards: [
        {
          id: 'board-1',
          estimation_type: 't-shirt',
          extended_estimation: true,
          allow_zero_estimates: true,
        },
      ],
    });
  });

  it('seeds the board config cache when estimation is configured before the board config has loaded', () => {
    const queryClient = new QueryClient();

    syncBoardEstimationCaches({
      queryClient,
      workspaceId: 'ws-1',
      boardId: 'board-1',
      boardName: 'Planning',
      board: {
        id: 'board-1',
        name: 'Planning',
        estimation_type: 'fibonacci',
        extended_estimation: false,
        allow_zero_estimates: true,
        count_unestimated_issues: true,
        created_at: '2026-05-17T00:00:00.000Z',
      },
    });

    expect(
      queryClient.getQueryData<BoardConfig>(['board-config', 'ws-1', 'board-1'])
    ).toEqual({
      id: 'board-1',
      ws_id: 'ws-1',
      ticket_prefix: null,
      estimation_type: 'fibonacci',
      extended_estimation: false,
      allow_zero_estimates: true,
    });
  });
});
