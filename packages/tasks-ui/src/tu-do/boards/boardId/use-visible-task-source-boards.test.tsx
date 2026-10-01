import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ boards: vi.fn(), hidden: vi.fn() }));
vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTaskBoards: f.boards,
}));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  listWorkspaces: async () => [
    { id: 'visible', name: 'Visible' },
    { id: 'hidden', name: 'Private hidden name' },
  ],
}));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: f.hidden,
  updateCurrentUserHiddenWorkspace: vi.fn(),
}));

import { useVisibleTaskSourceBoards } from './use-visible-task-source-boards';

describe('retained task source filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.hidden.mockResolvedValue({ hiddenWorkspaceIds: ['hidden'] });
    f.boards.mockResolvedValue({
      boards: [
        { id: 'visible-board', ws_id: 'visible', name: 'Visible board' },
      ],
    });
  });
  function fixture() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <WorkspaceVisibilityProvider actorId="actor-A">
          {children}
        </WorkspaceVisibilityProvider>
      </QueryClientProvider>
    );
    return { wrapper };
  }
  it('queries/displays only visible retained IDs without mutating saved filters', async () => {
    const savedWs = ['hidden', 'visible'];
    const savedBoards = ['hidden-board', 'visible-board'];
    const { wrapper } = fixture();
    const { result } = renderHook(
      () => useVisibleTaskSourceBoards(true, 'visible', savedWs, savedBoards),
      { wrapper }
    );
    await waitFor(() =>
      expect(result.current.visibleBoardIds).toEqual(['visible-board'])
    );
    expect(f.boards).toHaveBeenCalledTimes(1);
    expect(f.boards).toHaveBeenCalledWith('visible', expect.anything());
    expect(result.current.visibleWorkspaceIds).toEqual(['visible']);
    expect(savedWs).toEqual(['hidden', 'visible']);
    expect(savedBoards).toEqual(['hidden-board', 'visible-board']);
  });
  it('never fetches a retained Hidden-only source or invents UUID labels', async () => {
    const { wrapper } = fixture();
    const { result } = renderHook(
      () =>
        useVisibleTaskSourceBoards(
          true,
          'visible',
          ['hidden'],
          ['hidden-board']
        ),
      { wrapper }
    );
    await waitFor(() =>
      expect(result.current.sourceWorkspaces).toHaveLength(1)
    );
    expect(f.boards).not.toHaveBeenCalled();
    expect(result.current.sourceBoards).toEqual([]);
    expect(result.current.visibleWorkspaceIds).toEqual([]);
  });
  it('fails unknown visibility closed', async () => {
    f.hidden.mockRejectedValue(new Error('offline'));
    const { wrapper } = fixture();
    const { result } = renderHook(
      () =>
        useVisibleTaskSourceBoards(
          true,
          'visible',
          ['visible'],
          ['visible-board']
        ),
      { wrapper }
    );
    await waitFor(() => expect(f.hidden).toHaveBeenCalled());
    expect(f.boards).not.toHaveBeenCalled();
    expect(result.current.sourceBoards).toEqual([]);
  });
});
