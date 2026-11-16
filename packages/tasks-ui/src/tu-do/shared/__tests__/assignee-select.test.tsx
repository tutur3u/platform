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
const searchPeopleMock = vi.fn();

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api/people', () => ({
  searchWorkspacePeople: (...args: Parameters<typeof searchPeopleMock>) =>
    searchPeopleMock(...args),
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
    searchPeopleMock.mockResolvedValue({ data: [] });
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

  it('keeps contact links and ineligible people out of board assignment', async () => {
    listWorkspaceTaskBoardViewableMembersMock.mockResolvedValue({
      members: [
        {
          id: 'guest-1',
          user_id: 'guest-1',
          display_name: 'Guest',
          email: 'guest@example.com',
        },
      ],
    });
    searchPeopleMock.mockResolvedValue({
      data: [
        {
          kind: 'contact',
          id: 'contact-1',
          linkedUserId: 'outside-1',
          displayName: 'Guest Contact',
          email: 'guest@example.com',
          avatarUrl: null,
        },
        {
          kind: 'member',
          id: 'outside-1',
          displayName: 'Guest Outsider',
          email: 'guest@example.com',
          avatarUrl: null,
        },
      ],
    });
    const ref = createRef<AssigneeSelectHandle>();
    renderWithQueryClient({ taskId: 'task-1' }, ref);
    await waitFor(() =>
      expect(listWorkspaceTaskBoardViewableMembersMock).toHaveBeenCalled()
    );
    act(() => ref.current?.open());
    fireEvent.change(screen.getByPlaceholderText('task_contacts.search'), {
      target: { value: 'Guest' },
    });
    const contactLink = await screen.findByRole('link');
    expect(contactLink.getAttribute('href')).toMatch(
      /\/ws-1\/users\/database\/contact-1$/
    );
    expect(screen.queryByText('Guest Outsider')).not.toBeInTheDocument();
    fireEvent.click(contactLink);
    expect(updateWorkspaceTaskMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Guest'));
    await waitFor(() =>
      expect(updateWorkspaceTaskMock).toHaveBeenCalledWith('ws-1', 'task-1', {
        assignee_ids: ['guest-1'],
      })
    );
  });

  it('retains board guests when the contact read is denied', async () => {
    listWorkspaceTaskBoardViewableMembersMock.mockResolvedValue({
      members: [
        {
          id: 'guest-1',
          user_id: 'guest-1',
          display_name: 'Guest',
          email: 'guest@example.com',
        },
      ],
    });
    searchPeopleMock.mockRejectedValue(new Error('Forbidden'));
    const ref = createRef<AssigneeSelectHandle>();
    renderWithQueryClient({ taskId: 'task-1' }, ref);
    await waitFor(() =>
      expect(listWorkspaceTaskBoardViewableMembersMock).toHaveBeenCalled()
    );
    act(() => ref.current?.open());
    fireEvent.change(screen.getByPlaceholderText('task_contacts.search'), {
      target: { value: 'Guest' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('unavailable');
    fireEvent.click(screen.getByText('Guest'));
    await waitFor(() =>
      expect(updateWorkspaceTaskMock).toHaveBeenCalledWith('ws-1', 'task-1', {
        assignee_ids: ['guest-1'],
      })
    );
  });
});
