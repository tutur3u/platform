import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMindBoardLibrary } from './use-mind-board-library';

const pushMock = vi.fn();
const listMindBoardsMock = vi.fn();
const createMindBoardMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@tuturuuu/internal-api/mind', () => ({
  createMindBoard: (...args: unknown[]) => createMindBoardMock(...args),
  listMindBoards: (...args: unknown[]) => listMindBoardsMock(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

describe('useMindBoardLibrary', () => {
  beforeEach(() => {
    pushMock.mockReset();
    listMindBoardsMock.mockReset();
    createMindBoardMock.mockReset();
    listMindBoardsMock.mockResolvedValue({ boards: [] });
  });

  it('navigates to the web-hosted board route when a board is selected', () => {
    const { result } = renderHook(
      () =>
        useMindBoardLibrary({
          mindPrefix: '/mind',
          workspaceSlug: 'personal',
          wsId: 'ws-1',
        }),
      { wrapper: createWrapper() }
    );

    result.current.onSelectBoard('board-1');

    expect(pushMock).toHaveBeenCalledWith('/personal/mind/boards/board-1');
  });

  it('creates a board and navigates to the new studio route', async () => {
    createMindBoardMock.mockResolvedValue({
      board: { id: 'board-new', title: 'Roadmap' },
    });

    const { result } = renderHook(
      () =>
        useMindBoardLibrary({
          mindPrefix: '/mind',
          workspaceSlug: 'personal',
          wsId: 'ws-1',
        }),
      { wrapper: createWrapper() }
    );

    result.current.onCreateBoard('Roadmap');

    await waitFor(() => {
      expect(createMindBoardMock).toHaveBeenCalledWith(
        { defaultHorizon: 'year', title: 'Roadmap' },
        { workspaceId: 'ws-1' }
      );
      expect(pushMock).toHaveBeenCalledWith('/personal/mind/boards/board-new');
    });
  });
});
