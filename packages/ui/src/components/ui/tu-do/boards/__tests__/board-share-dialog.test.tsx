import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardShareDialog } from '../board-share-dialog';

const createWorkspaceTaskBoardShareMock = vi.fn();
const deleteWorkspaceTaskBoardShareMock = vi.fn();
const listWorkspaceTaskBoardSharesMock = vi.fn();
const listWorkspaceTaskBoardViewableMembersMock = vi.fn();
const updateWorkspaceTaskBoardShareMock = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  createWorkspaceTaskBoardShare: (
    ...args: Parameters<typeof createWorkspaceTaskBoardShareMock>
  ) => createWorkspaceTaskBoardShareMock(...args),
  deleteWorkspaceTaskBoardShare: (
    ...args: Parameters<typeof deleteWorkspaceTaskBoardShareMock>
  ) => deleteWorkspaceTaskBoardShareMock(...args),
  listWorkspaceTaskBoardShares: (
    ...args: Parameters<typeof listWorkspaceTaskBoardSharesMock>
  ) => listWorkspaceTaskBoardSharesMock(...args),
  listWorkspaceTaskBoardViewableMembers: (
    ...args: Parameters<typeof listWorkspaceTaskBoardViewableMembersMock>
  ) => listWorkspaceTaskBoardViewableMembersMock(...args),
  updateWorkspaceTaskBoardShare: (
    ...args: Parameters<typeof updateWorkspaceTaskBoardShareMock>
  ) => updateWorkspaceTaskBoardShareMock(...args),
}));

vi.mock('../board-public-link-section', () => ({
  BoardPublicLinkSection: () => <div data-testid="public-link-section" />,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function renderBoardShareDialog() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BoardShareDialog
        board={{ id: 'board-1', name: 'Tasks' }}
        onOpenChange={vi.fn()}
        open
        wsId="ws-1"
      />
    </QueryClientProvider>
  );
}

describe('BoardShareDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listWorkspaceTaskBoardSharesMock.mockResolvedValue({ shares: [] });
    listWorkspaceTaskBoardViewableMembersMock.mockResolvedValue({
      members: [
        {
          avatar_url: null,
          display_name: 'Project Manager',
          email: 'pm@example.com',
          handle: null,
          id: 'user-1',
          is_creator: false,
          roles: [{ id: 'role-1', name: 'Project manager' }],
          user_id: 'user-1',
          workspace_member_type: 'MEMBER',
        },
      ],
    });
  });

  it('renders tooltip note triggers and fetches viewable members only when opened', async () => {
    renderBoardShareDialog();

    expect(screen.getByTestId('public-link-section')).toBeInTheDocument();
    expect(
      screen.getAllByLabelText('ws-task-boards.share.note').length
    ).toBeGreaterThan(0);
    expect(listWorkspaceTaskBoardViewableMembersMock).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByText('ws-task-boards.share.workspace_members.title')
    );

    await waitFor(() => {
      expect(listWorkspaceTaskBoardViewableMembersMock).toHaveBeenCalledWith(
        'ws-1',
        'board-1'
      );
    });
    expect(await screen.findByText('Project Manager')).toBeInTheDocument();
    expect(screen.getByText('pm@example.com')).toBeInTheDocument();
  });
});
