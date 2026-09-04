import { QueryClient } from '@tanstack/react-query';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';
import { getCachedBoardConfig, toBoardConfig } from './board';

function board(overrides: Partial<WorkspaceTaskBoard> = {}) {
  return {
    id: 'board-1',
    name: 'Roadmap',
    ws_id: 'workspace-1',
    ticket_prefix: 'VHP',
    ...overrides,
  } as WorkspaceTaskBoard;
}

describe('board config cache', () => {
  it('derives the ticket prefix and estimation defaults from cached board metadata', () => {
    expect(toBoardConfig(board())).toEqual({
      id: 'board-1',
      name: 'Roadmap',
      ws_id: 'workspace-1',
      ticket_prefix: 'VHP',
      estimation_type: null,
      extended_estimation: false,
      allow_zero_estimates: false,
      count_unestimated_issues: false,
    });
  });

  it('finds a cached personal board by board id when its query scope uses an alias', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ['task-board', 'personal', 'board-1'],
      board({ ws_id: 'user-workspace-id' })
    );

    expect(
      getCachedBoardConfig(queryClient, 'board-1', 'user-workspace-id')
        ?.ticket_prefix
    ).toBe('VHP');
  });

  it('does not reuse metadata from another board', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ['task-board', 'workspace-1', 'board-2'],
      board({ id: 'board-2' })
    );

    expect(
      getCachedBoardConfig(queryClient, 'board-1', 'workspace-1')
    ).toBeUndefined();
  });
});
