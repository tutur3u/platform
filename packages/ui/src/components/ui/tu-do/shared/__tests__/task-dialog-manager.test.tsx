import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TaskDialogProvider,
  useTaskDialogContext,
} from '../../providers/task-dialog-provider';
import { RECENT_SIDEBAR_VISIT_EVENT } from '../recent-sidebar-events';
import { TaskDialogManager } from '../task-dialog-manager';
import { REQUEST_OPEN_TASK_EVENT } from '../task-open-events';

// Mock Next.js navigation (no longer needs useRouter/usePathname for URL manipulation)
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/workspace-1/tasks',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ wsId: 'workspace-1' }),
}));

const {
  mockGetCurrentUserProfile,
  mockGetCurrentUserTask,
  mockListWorkspaceLabels,
  mockListWorkspaceMembers,
  mockListWorkspaceTaskProjectsByIds,
  mockResolveTaskProjectWorkspaceId,
} = vi.hoisted(() => ({
  mockGetCurrentUserProfile: vi.fn(),
  mockGetCurrentUserTask: vi.fn(),
  mockListWorkspaceLabels: vi.fn(),
  mockListWorkspaceMembers: vi.fn(),
  mockListWorkspaceTaskProjectsByIds: vi.fn(),
  mockResolveTaskProjectWorkspaceId: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserProfile: mockGetCurrentUserProfile,
  listWorkspaceLabels: mockListWorkspaceLabels,
  listWorkspaceMembers: mockListWorkspaceMembers,
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getCurrentUserTask: mockGetCurrentUserTask,
  listWorkspaceTaskProjectsByIds: mockListWorkspaceTaskProjectsByIds,
  resolveTaskProjectWorkspaceId: mockResolveTaskProjectWorkspaceId,
}));

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'task-1',
                  name: 'Test Task',
                  description: '',
                  priority: 'normal',
                  start_date: undefined,
                  end_date: null,
                  estimation_points: null,
                  list_id: 'list-1',
                  created_at: '2024-01-01T00:00:00Z',
                  sort_key: 1000,
                  display_number: 1,
                  list: {
                    id: 'list-1',
                    name: 'To Do',
                    board_id: 'board-1',
                    board: {
                      id: 'board-1',
                      ws_id: 'workspace-1',
                      workspace: { personal: false },
                    },
                  },
                  assignees: [],
                  labels: [],
                  projects: [],
                },
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === 'task_lists') {
        const orderChain = {
          order: vi.fn(() => orderChain),
        };

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => orderChain),
            })),
          })),
        };
      }

      if (table === 'users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            })),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          })),
        })),
      };
    }),
  })),
}));

// Mock the TaskEditDialog component since it's lazy-loaded
vi.mock('../task-edit-dialog', () => ({
  TaskEditDialog: ({
    isOpen,
    task,
    onClose,
  }: {
    isOpen: boolean;
    task?: Task;
    onClose: () => void;
  }) => (
    <div data-testid="task-edit-dialog" data-open={isOpen}>
      {task && <div data-testid="task-name">{task.name}</div>}
      <button type="button" onClick={onClose} data-testid="close-button">
        Close
      </button>
    </div>
  ),
}));

// Mock task data
const mockTask: Task = {
  id: 'task-1',
  name: 'Test Task',
  description: '',
  priority: 'normal',
  start_date: undefined,
  end_date: null,
  estimation_points: null,
  list_id: 'list-1',
  labels: [],
  assignees: [],
  created_at: '2024-01-01T00:00:00Z',
  sort_key: 1000,
  display_number: 1,
};

const mockList: TaskList = {
  id: 'list-1',
  name: 'To Do',
  board_id: 'board-1',
  position: 0,
  status: 'not_started',
  color: 'BLUE',
  created_at: '2024-01-01T00:00:00Z',
  creator_id: 'user-1',
  archived: false,
  deleted: false,
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <TaskDialogProvider>{children}</TaskDialogProvider>
    </QueryClientProvider>
  );
}

// Spy on window.history methods for URL manipulation tests
let pushStateSpy: ReturnType<typeof vi.spyOn>;
let replaceStateSpy: ReturnType<typeof vi.spyOn>;
const fetchMock = vi.fn();

beforeEach(() => {
  pushStateSpy = vi.spyOn(window.history, 'pushState');
  replaceStateSpy = vi.spyOn(window.history, 'replaceState');
  mockGetCurrentUserProfile.mockResolvedValue({
    id: 'user-1',
    display_name: 'Test User',
    email: 'user@example.com',
    avatar_url: null,
  });
  mockGetCurrentUserTask.mockResolvedValue({
    task: {
      ...mockTask,
      list: { board_id: 'board-1' },
    },
    availableLists: [mockList],
    taskWsId: 'workspace-1',
    taskWorkspacePersonal: false,
  });
  mockListWorkspaceLabels.mockResolvedValue({ labels: [] });
  mockListWorkspaceMembers.mockResolvedValue({ members: [] });
  mockListWorkspaceTaskProjectsByIds.mockResolvedValue([]);
  mockResolveTaskProjectWorkspaceId.mockResolvedValue('workspace-1');
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ value: 'false' }),
  });
  global.fetch = fetchMock as typeof fetch;
  // Set a known initial pathname for tests
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: '/workspace-1/tasks' },
    writable: true,
  });
});

afterEach(() => {
  pushStateSpy.mockRestore();
  replaceStateSpy.mockRestore();
  vi.restoreAllMocks();
});

describe('TaskDialogManager', () => {
  it('should render nothing when dialog is not open', () => {
    const { container } = render(
      <Wrapper>
        <TaskDialogManager wsId="workspace-1" />
      </Wrapper>
    );

    expect(container.firstChild).toBeNull();
  });

  it.skip('should lazy load and render TaskEditDialog when opened', async () => {
    const TestComponent = () => {
      const { openTask } = useTaskDialogContext();

      React.useEffect(() => {
        // Simulate opening the dialog after mount
        openTask(mockTask, 'board-1', [mockList]);
      }, [openTask]);

      return <TaskDialogManager wsId="workspace-1" />;
    };

    const { queryByTestId } = render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    // Initially, dialog should not be rendered
    expect(queryByTestId('task-edit-dialog')).not.toBeInTheDocument();

    // Wait for the dialog to be loaded and rendered
    await waitFor(
      () => {
        expect(queryByTestId('task-edit-dialog')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it('should pass correct props to TaskEditDialog', async () => {
    const TestComponent = () => {
      const { openTask } = useTaskDialogContext();

      React.useEffect(() => {
        openTask(mockTask, 'board-1', [mockList]);
      }, [openTask]);

      return <TaskDialogManager wsId="workspace-1" />;
    };

    const { getByTestId } = render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    await waitFor(() => {
      expect(getByTestId('task-edit-dialog')).toBeInTheDocument();
      expect(getByTestId('task-edit-dialog')).toHaveAttribute(
        'data-open',
        'true'
      );
      expect(getByTestId('task-name')).toHaveTextContent('Test Task');
    });
  });

  it('should handle Suspense boundary correctly', async () => {
    const { container } = render(
      <Wrapper>
        <TaskDialogManager wsId="workspace-1" />
      </Wrapper>
    );

    // Should not crash during lazy loading
    expect(container).toBeInTheDocument();
  });

  it('should render in create mode', async () => {
    const TestComponent = () => {
      const { createTask } = useTaskDialogContext();

      React.useEffect(() => {
        createTask('board-1', 'list-1', [mockList]);
      }, [createTask]);

      return <TaskDialogManager wsId="workspace-1" />;
    };

    const { getByTestId } = render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    await waitFor(() => {
      expect(getByTestId('task-edit-dialog')).toBeInTheDocument();
    });
  });

  it('should handle close callback', async () => {
    const TestComponent = () => {
      const { openTask, state } = useTaskDialogContext();

      React.useEffect(() => {
        openTask(mockTask, 'board-1', [mockList]);
      }, [openTask]);

      return (
        <div>
          <TaskDialogManager wsId="workspace-1" />
          <div data-testid="dialog-open-state">{String(state.isOpen)}</div>
        </div>
      );
    };

    const { getByTestId } = render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    await waitFor(() => {
      expect(getByTestId('dialog-open-state')).toHaveTextContent('true');
    });

    // Click close button
    const closeButton = getByTestId('close-button');
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(getByTestId('dialog-open-state')).toHaveTextContent('false');
    });
  });

  it('should use pushState for fakeTaskUrl instead of router.push', async () => {
    const TestComponent = () => {
      const { openTask } = useTaskDialogContext();

      React.useEffect(() => {
        openTask(mockTask, 'board-1', [mockList], true);
      }, [openTask]);

      return <TaskDialogManager wsId="workspace-1" />;
    };

    render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    await waitFor(() => {
      expect(pushStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ __fakeTaskUrl: true }),
        '',
        '/workspace-1/tasks/task-1'
      );
    });
  });

  it('dispatches a recent visit snapshot when an edit dialog opens', async () => {
    const listener = vi.fn();
    window.addEventListener(
      RECENT_SIDEBAR_VISIT_EVENT,
      listener as EventListener
    );

    const TestComponent = () => {
      const { openTask } = useTaskDialogContext();

      React.useEffect(() => {
        openTask(
          {
            ...mockTask,
            list: {
              board: { name: 'Tuverse' },
              name: 'Backlog',
            },
          } as Task,
          'board-1',
          [mockList]
        );
      }, [openTask]);

      return <TaskDialogManager wsId="workspace-1" />;
    };

    render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    await waitFor(() => {
      expect(listener).toHaveBeenCalled();
    });

    const event = listener.mock.calls.at(-1)?.[0] as CustomEvent<{
      href: string;
      scopeWsId: string;
      snapshot: {
        badges: Array<{ kind: string; value?: string }>;
        title: string;
      };
    }>;

    expect(event.detail).toMatchObject({
      href: '/workspace-1/tasks/task-1',
      scopeWsId: 'workspace-1',
      snapshot: {
        badges: [
          { kind: 'board', value: 'Tuverse' },
          { kind: 'list', value: 'Backlog' },
        ],
        title: 'Test Task',
      },
    });

    window.removeEventListener(
      RECENT_SIDEBAR_VISIT_EVENT,
      listener as EventListener
    );
  });

  it('opens a task when a shared task-open event is dispatched', async () => {
    render(
      <Wrapper>
        <TaskDialogManager wsId="workspace-1" />
      </Wrapper>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(REQUEST_OPEN_TASK_EVENT, {
          detail: { taskId: 'task-42' },
        })
      );
    });

    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="task-edit-dialog"]')
      ).toBeInTheDocument();
      expect(
        document.querySelector('[data-testid="task-name"]')
      ).toHaveTextContent('Test Task');
    });
  });

  it('should use replaceState to revert URL when dialog closes', async () => {
    const TestComponent = () => {
      const { openTask, state } = useTaskDialogContext();

      React.useEffect(() => {
        openTask(mockTask, 'board-1', [mockList], true);
      }, [openTask]);

      return (
        <div>
          <TaskDialogManager wsId="workspace-1" />
          <div data-testid="dialog-open-state">{String(state.isOpen)}</div>
        </div>
      );
    };

    const { getByTestId } = render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    // Wait for dialog to open and pushState to be called
    await waitFor(() => {
      expect(getByTestId('dialog-open-state')).toHaveTextContent('true');
      expect(pushStateSpy).toHaveBeenCalled();
    });

    // Close dialog
    const closeButton = getByTestId('close-button');
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(getByTestId('dialog-open-state')).toHaveTextContent('false');
      // Should replaceState back to original pathname
      expect(replaceStateSpy).toHaveBeenCalledWith(
        null,
        '',
        '/workspace-1/tasks'
      );
    });
  });

  it('should close dialog on popstate (browser back) when fakeTaskUrl is active', async () => {
    const TestComponent = () => {
      const { openTask, state } = useTaskDialogContext();

      React.useEffect(() => {
        openTask(mockTask, 'board-1', [mockList], true);
      }, [openTask]);

      return (
        <div>
          <TaskDialogManager wsId="workspace-1" />
          <div data-testid="dialog-open-state">{String(state.isOpen)}</div>
        </div>
      );
    };

    const { getByTestId } = render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    // Wait for dialog to open
    await waitFor(() => {
      expect(getByTestId('dialog-open-state')).toHaveTextContent('true');
      expect(pushStateSpy).toHaveBeenCalled();
    });

    // Simulate browser back button
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(getByTestId('dialog-open-state')).toHaveTextContent('false');
    });
  });
});
