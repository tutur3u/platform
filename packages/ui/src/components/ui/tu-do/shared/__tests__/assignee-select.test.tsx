import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type React from 'react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssigneeSelect, type AssigneeSelectHandle } from '../assignee-select';

const listWorkspaceTaskBoardViewableMembersMock = vi.fn();
const updateWorkspaceTaskMock = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({
    wsId: 'ws-1',
    boardId: 'board-1',
  }),
}));

vi.mock('@tuturuuu/ui/hooks/use-workspace-members', () => ({
  useWorkspaceMembers: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTaskBoardViewableMembers: (
    ...args: Parameters<typeof listWorkspaceTaskBoardViewableMembersMock>
  ) => listWorkspaceTaskBoardViewableMembersMock(...args),
  updateWorkspaceTask: (...args: Parameters<typeof updateWorkspaceTaskMock>) =>
    updateWorkspaceTaskMock(...args),
}));

vi.mock('../board-broadcast-context', () => ({
  useBoardBroadcast: () => null,
}));

describe('AssigneeSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listWorkspaceTaskBoardViewableMembersMock.mockResolvedValue({
      members: [],
    });
    updateWorkspaceTaskMock.mockResolvedValue({});
  });

  function renderWithQueryClient(
    props: React.ComponentProps<typeof AssigneeSelect> = {
      taskId: 'task-1',
    },
    ref?: React.Ref<AssigneeSelectHandle>
  ) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <AssigneeSelect {...props} ref={ref} />
      </QueryClientProvider>
    );
  }

  it('does not enter a render loop when rerendered with equivalent assignees', () => {
    const assignees: React.ComponentProps<typeof AssigneeSelect>['assignees'] =
      [
        {
          id: 'member-1',
          display_name: 'Alex',
          email: 'alex@example.com',
        },
      ];

    const { rerender } = renderWithQueryClient({
      assignees,
      taskId: 'task-1',
    });

    expect(() =>
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <AssigneeSelect taskId="task-1" assignees={[{ ...assignees[0]! }]} />
        </QueryClientProvider>
      )
    ).not.toThrow();
  });

  it('uses board viewable members so direct guests can be assigned', async () => {
    listWorkspaceTaskBoardViewableMembersMock.mockResolvedValue({
      members: [
        {
          avatar_url: null,
          display_name: 'Board Guest',
          email: 'guest@example.com',
          handle: null,
          id: 'guest-user-1',
          is_creator: false,
          roles: [],
          user_id: 'guest-user-1',
          workspace_member_type: 'GUEST',
        },
      ],
    });

    const assigneeSelectRef = createRef<AssigneeSelectHandle>();
    renderWithQueryClient({ taskId: 'task-1' }, assigneeSelectRef);

    await waitFor(() => {
      expect(listWorkspaceTaskBoardViewableMembersMock).toHaveBeenCalledWith(
        'ws-1',
        'board-1'
      );
    });
    act(() => {
      assigneeSelectRef.current?.open();
    });

    expect(await screen.findByText('Board Guest')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Board Guest'));

    await waitFor(() => {
      expect(updateWorkspaceTaskMock).toHaveBeenCalledWith('ws-1', 'task-1', {
        assignee_ids: ['guest-user-1'],
      });
    });
  });
});
