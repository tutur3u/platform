/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceProjectsClientPage from '../workspace-projects-client-page';

const mocks = vi.hoisted(() => ({
  checkWorkspacePermission: vi.fn(),
  getWorkspace: vi.fn(),
  getWorkspaceBoardsData: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ wsId: 'personal' }),
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  checkWorkspacePermission: (
    ...args: Parameters<typeof mocks.checkWorkspacePermission>
  ) => mocks.checkWorkspacePermission(...args),
  getWorkspace: (...args: Parameters<typeof mocks.getWorkspace>) =>
    mocks.getWorkspace(...args),
  getWorkspaceBoardsData: (
    ...args: Parameters<typeof mocks.getWorkspaceBoardsData>
  ) => mocks.getWorkspaceBoardsData(...args),
}));

vi.mock('@tuturuuu/ui/hooks/use-workspace-user', () => ({
  useWorkspaceUser: () => ({
    data: { id: 'user-1' },
    isLoading: false,
  }),
}));

vi.mock('../enhanced-boards-view', () => ({
  EnhancedBoardsView: () => <div data-testid="boards-view" />,
}));

vi.mock('../quick-create-board-dialog', () => ({
  QuickCreateBoardDialog: () => <div data-testid="quick-create-board-dialog" />,
}));

vi.mock('../form', () => ({
  TaskBoardForm: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe('WorkspaceProjectsClientPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspace.mockResolvedValue({
      id: 'personal',
      personal: true,
    });
    mocks.checkWorkspacePermission.mockResolvedValue({
      hasPermission: true,
    });
    mocks.getWorkspaceBoardsData.mockResolvedValue({
      count: 1,
      data: [
        {
          id: 'board-1',
          name: 'Tasks',
          archived_at: null,
          deleted_at: null,
        },
      ],
    });
  });

  it('keeps direct personal board index navigation on the board picker', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceProjectsClientPage />
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('boards-view')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
