import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardShareDialog } from '../board-share-dialog';

const createWorkspaceTaskBoardShareMock = vi.fn();
const deleteWorkspaceTaskBoardShareMock = vi.fn();
const disableWorkspaceTaskBoardPublicLinkMock = vi.fn();
const enableWorkspaceTaskBoardPublicLinkMock = vi.fn();
const getWorkspaceTaskBoardPublicLinkMock = vi.fn();
const listWorkspaceTaskBoardSharesMock = vi.fn();
const listWorkspaceTaskBoardViewableMembersMock = vi.fn();
const updateWorkspaceTaskBoardShareMock = vi.fn();

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({
    disabled,
    onChange,
    options,
    placeholder,
    selected,
  }: {
    disabled?: boolean;
    onChange?: (value: string) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    selected: string;
  }) => (
    <select
      aria-label={placeholder}
      disabled={disabled}
      value={selected}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  createWorkspaceTaskBoardShare: (
    ...args: Parameters<typeof createWorkspaceTaskBoardShareMock>
  ) => createWorkspaceTaskBoardShareMock(...args),
  deleteWorkspaceTaskBoardShare: (
    ...args: Parameters<typeof deleteWorkspaceTaskBoardShareMock>
  ) => deleteWorkspaceTaskBoardShareMock(...args),
  disableWorkspaceTaskBoardPublicLink: (
    ...args: Parameters<typeof disableWorkspaceTaskBoardPublicLinkMock>
  ) => disableWorkspaceTaskBoardPublicLinkMock(...args),
  enableWorkspaceTaskBoardPublicLink: (
    ...args: Parameters<typeof enableWorkspaceTaskBoardPublicLinkMock>
  ) => enableWorkspaceTaskBoardPublicLinkMock(...args),
  getWorkspaceTaskBoardPublicLink: (
    ...args: Parameters<typeof getWorkspaceTaskBoardPublicLinkMock>
  ) => getWorkspaceTaskBoardPublicLinkMock(...args),
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
    getWorkspaceTaskBoardPublicLinkMock.mockResolvedValue({ publicLink: null });
    enableWorkspaceTaskBoardPublicLinkMock.mockResolvedValue({
      publicLink: { code: 'abc123' },
    });
    disableWorkspaceTaskBoardPublicLinkMock.mockResolvedValue({
      publicLink: null,
    });
    createWorkspaceTaskBoardShareMock.mockResolvedValue({ share: null });
    updateWorkspaceTaskBoardShareMock.mockResolvedValue({ share: null });
    deleteWorkspaceTaskBoardShareMock.mockResolvedValue({ ok: true });
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

  it('starts compact with all sections collapsed and tooltip copy hidden', async () => {
    renderBoardShareDialog();

    for (const title of [
      'ws-task-boards.share.public.title',
      'ws-task-boards.share.workspace_members.title',
      'ws-task-boards.share.guests.title',
    ]) {
      expect(
        screen.getByRole('button', { name: new RegExp(title) })
      ).toHaveAttribute('aria-expanded', 'false');
    }

    expect(
      screen.queryByText('ws-task-boards.share.public.description')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('ws-task-boards.share.public.tooltip')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('ws-task-boards.share.workspace_members.description')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('ws-task-boards.share.guests.description')
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(getWorkspaceTaskBoardPublicLinkMock).toHaveBeenCalledWith(
        'ws-1',
        'board-1'
      );
    });
    expect(listWorkspaceTaskBoardViewableMembersMock).not.toHaveBeenCalled();

    expect(await screen.findByText('common.disabled')).toBeInTheDocument();
    expect(screen.getByText('common.workspace')).toBeInTheDocument();
    expect(screen.getByText('common.none')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /ws-task-boards.share.shared_with/,
      })
    ).not.toBeInTheDocument();
  });

  it('fetches viewable members only when the workspace section opens', async () => {
    renderBoardShareDialog();

    fireEvent.click(
      screen.getByRole('button', {
        name: /ws-task-boards.share.workspace_members.title/,
      })
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

  it('does not crash when viewable members payload is missing members', async () => {
    listWorkspaceTaskBoardViewableMembersMock.mockResolvedValue({});

    renderBoardShareDialog();

    fireEvent.click(
      screen.getByRole('button', {
        name: /ws-task-boards.share.workspace_members.title/,
      })
    );

    expect(
      await screen.findByText('ws-task-boards.share.workspace_members.empty')
    ).toBeInTheDocument();
  });

  it('keeps direct board guests first-class for invite, update, and remove', async () => {
    listWorkspaceTaskBoardSharesMock.mockResolvedValue({
      shares: [
        {
          id: 'share-1',
          email: 'guest@example.com',
          permission: 'view',
          user: null,
          user_id: null,
        },
      ],
    });

    renderBoardShareDialog();
    await waitFor(() => {
      expect(listWorkspaceTaskBoardSharesMock).toHaveBeenCalledWith(
        'ws-1',
        'board-1'
      );
    });
    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: /ws-task-boards.share.guests.title/,
        })
      ).toHaveTextContent('1');
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /ws-task-boards.share.guests.title/,
      })
    );
    fireEvent.change(
      screen.getByPlaceholderText('ws-task-boards.share.email_placeholder'),
      {
        target: { value: 'new@example.com' },
      }
    );
    fireEvent.click(screen.getByText('common.share'));

    await waitFor(() => {
      expect(createWorkspaceTaskBoardShareMock).toHaveBeenCalledWith(
        'ws-1',
        'board-1',
        { email: 'new@example.com', permission: 'view' }
      );
    });

    expect(await screen.findAllByText('guest@example.com')).toHaveLength(2);

    fireEvent.change(
      screen.getAllByLabelText('ws-task-boards.share.permission.view').at(-1)!,
      { target: { value: 'edit' } }
    );
    await waitFor(() => {
      expect(updateWorkspaceTaskBoardShareMock).toHaveBeenCalledWith(
        'ws-1',
        'board-1',
        { shareId: 'share-1', permission: 'edit' }
      );
    });

    fireEvent.click(screen.getByLabelText('common.remove'));
    await waitFor(() => {
      expect(deleteWorkspaceTaskBoardShareMock).toHaveBeenCalledWith(
        'ws-1',
        'board-1',
        'share-1'
      );
    });
  });
});
