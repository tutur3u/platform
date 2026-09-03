/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from '@tuturuuu/ui/sonner';
import type { ExtendedWorkspaceTask } from '@tuturuuu/ui/time-tracker/types';
import type { ReactNode } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import TimeTracker from '../time-tracker';

const invalidateQueries = vi.fn();

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@tuturuuu/utils/hooks/use-platform', () => ({
  usePlatform: () => ({ modKey: 'Ctrl' }),
}));

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
      status,
    })
  );
}

function runningSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-running',
    title: 'Live session',
    description: 'Live notes',
    start_time: new Date(Date.now() - 5_000).toISOString(),
    end_time: null,
    duration_seconds: null,
    is_running: true,
    category_id: null,
    task_id: null,
    category: null,
    task: null,
    ...overrides,
  };
}

function completedSession(overrides: Record<string, unknown> = {}) {
  return {
    ...runningSession(),
    id: 'session-completed',
    title: 'Completed session',
    end_time: new Date().toISOString(),
    duration_seconds: 125,
    is_running: false,
    ...overrides,
  };
}

function installFetchRouter({
  boards = [],
  current = null,
  failMutation = false,
  recent = [],
}: {
  boards?: unknown[];
  current?: ReturnType<typeof runningSession> | null;
  failMutation?: boolean;
  recent?: ReturnType<typeof completedSession>[];
} = {}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (failMutation && init?.method) {
        return jsonResponse(
          { error: 'synthetic mutation failure' },
          500
        );
      }

      if (init?.method === 'POST' && url.endsWith('/tasks')) {
        return jsonResponse({
          task: { id: 'task-created', name: 'Created task' },
        });
      }

      if (init?.method === 'POST' && url.endsWith('/time-tracking/sessions')) {
        return jsonResponse({ session: runningSession() });
      }

      if (
        init?.method === 'PATCH' &&
        url.includes('/time-tracking/sessions/')
      ) {
        const body = JSON.parse(String(init.body));
        return jsonResponse({
          session:
            body.action === 'stop'
              ? completedSession()
              : runningSession({ id: 'session-resumed' }),
        });
      }

      if (init?.method === 'DELETE') return jsonResponse({ ok: true });
      if (url.endsWith('/time-tracking/categories')) {
        return jsonResponse({ categories: [] });
      }
      if (url.includes('sessions?type=running')) {
        return jsonResponse({ session: current });
      }
      if (url.includes('sessions?type=recent')) {
        return jsonResponse({ sessions: recent });
      }
      if (url.includes('sessions?type=stats')) {
        return jsonResponse({
          stats: { todayTime: 0, weekTime: 0, monthTime: 0, streak: 0 },
        });
      }
      if (url.endsWith('/time-tracking/templates')) {
        return jsonResponse({ templates: [] });
      }
      if (url.endsWith('/boards-with-lists')) {
        return jsonResponse({ boards });
      }

      throw new Error(`Unexpected request: ${url}`);
    }
  );

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderTracker({
  boards = [],
  current = null,
  failMutation = false,
  recent = [],
  tasks = [],
}: {
  boards?: unknown[];
  current?: ReturnType<typeof runningSession> | null;
  failMutation?: boolean;
  recent?: ReturnType<typeof completedSession>[];
  tasks?: ExtendedWorkspaceTask[];
} = {}) {
  const fetchMock = installFetchRouter({
    boards,
    current,
    failMutation,
    recent,
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.invalidateQueries = invalidateQueries;

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  render(<TimeTracker wsId="workspace-1" tasks={tasks} />, {
    wrapper: Wrapper,
  });
  return fetchMock;
}

function selectTab(name: RegExp) {
  const tab = screen.getByRole('tab', { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
}

function openMenuForSession() {
  const menuButton = document.querySelector(
    '[data-slot="dropdown-menu-trigger"]'
  );
  if (!menuButton) throw new Error('Session menu button was not rendered');
  fireEvent.pointerDown(menuButton, {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
  fireEvent.click(menuButton);
}

function comboboxBesideLabel(label: string) {
  const element = screen
    .getByText(label)
    .parentElement?.querySelector('[role="combobox"]');
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Combobox for ${label} was not rendered`);
  }
  return element;
}

async function openTracker() {
  fireEvent.click(screen.getByRole('button', { name: /time tracker/i }));
  await screen.findByRole('dialog');
}

describe('live time tracker contracts', () => {
  beforeEach(() => {
    invalidateQueries.mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fetches the five tracker resources and boards when the dialog opens', async () => {
    const fetchMock = renderTracker();

    expect(fetchMock).not.toHaveBeenCalled();
    await openTracker();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        'http://localhost:7809/api/v1/workspaces/workspace-1/time-tracking/categories',
        'http://localhost:7809/api/v1/workspaces/workspace-1/time-tracking/sessions?type=running',
        'http://localhost:7809/api/v1/workspaces/workspace-1/time-tracking/sessions?type=recent&limit=20',
        'http://localhost:7809/api/v1/workspaces/workspace-1/time-tracking/sessions?type=stats',
        'http://localhost:7809/api/v1/workspaces/workspace-1/time-tracking/templates',
        'http://localhost:7809/api/v1/workspaces/workspace-1/boards-with-lists',
      ])
    );
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.credentials === 'include')
    ).toBe(true);
    expect(
      screen.getByText(
        'Track your time across tasks and projects with detailed analytics'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Ctrl + Enter')).toBeInTheDocument();
  });

  it('starts a manual timer with the live payload and invalidates the sidebar query', async () => {
    const fetchMock = renderTracker();
    await openTracker();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));

    selectTab(/manual/i);
    fireEvent.change(screen.getByPlaceholderText('What are you working on?'), {
      target: { value: 'Write release notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/time-tracking/sessions') &&
          init?.method === 'POST'
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        title: 'Write release notes',
        description: null,
        categoryId: null,
        taskId: null,
      });
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['running-time-session', 'workspace-1'],
    });
    expect(toast.success).toHaveBeenCalledWith('Timer started!');
  });

  it('starts a selected task with the live title and task payload', async () => {
    const task = {
      id: 'task-1',
      name: 'Ship release',
    } as ExtendedWorkspaceTask;
    const fetchMock = renderTracker({ tasks: [task] });
    await openTracker();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));

    const taskSelect = comboboxBesideLabel('Select a task to track time for:');
    fireEvent.pointerDown(taskSelect, {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(
      await screen.findByRole('option', { name: /ship release/i })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/time-tracking/sessions') &&
          init?.method === 'POST'
      );
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        title: 'Working on: Ship release',
        description: null,
        categoryId: null,
        taskId: 'task-1',
      });
    });
  });

  it.each([
    ['Pause', 'pause', 'Timer paused'],
    ['Stop', 'stop', 'Session completed! Tracked 2m'],
  ])(
    'sends the %s transition for a running session',
    async (label, action, message) => {
      const fetchMock = renderTracker({ current: runningSession() });
      await openTracker();
      await screen.findByText('Live session');

      fireEvent.click(screen.getByRole('button', { name: label }));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find(
          ([url, init]) =>
            String(url).endsWith('/time-tracking/sessions/session-running') &&
            init?.method === 'PATCH'
        );
        expect(JSON.parse(String(call?.[1]?.body))).toEqual({ action });
      });
      if (action === 'stop') {
        expect(toast.success).toHaveBeenCalledWith(message, { duration: 4000 });
      } else {
        expect(toast.success).toHaveBeenCalledWith(message);
      }
    }
  );

  it('supports the live keyboard start shortcut and Escape close behavior', async () => {
    const fetchMock = renderTracker();
    await openTracker();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));

    selectTab(/manual/i);
    fireEvent.change(screen.getByPlaceholderText('What are you working on?'), {
      target: { value: 'Shortcut session' },
    });
    fireEvent.keyDown(document, { ctrlKey: true, key: 'Enter' });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')
      ).toBe(true);
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('resumes and deletes recent sessions with the live transition contracts', async () => {
    const recent = completedSession();
    const fetchMock = renderTracker({ recent: [recent] });
    await openTracker();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    selectTab(/^recent$/i);
    await screen.findByText('Completed session');

    openMenuForSession();
    fireEvent.click(await screen.findByText('Start New Session'));
    await waitFor(() => {
      const resume = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/time-tracking/sessions/session-completed') &&
          init?.method === 'PATCH'
      );
      expect(JSON.parse(String(resume?.[1]?.body))).toEqual({
        action: 'resume',
      });
    });
    expect(toast.success).toHaveBeenCalledWith(
      'Started new session: "Completed session"'
    );

    selectTab(/^recent$/i);
    openMenuForSession();
    fireEvent.click(await screen.findByText('Delete Session'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Session' })
    );
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith('/time-tracking/sessions/session-completed') &&
            init?.method === 'DELETE'
        )
      ).toBe(true);
    });
    expect(toast.success).toHaveBeenCalledWith(
      'Time session deleted successfully'
    );
  });

  it('keeps edit unavailable while preserving duplicate prefill behavior', async () => {
    const recent = completedSession({ description: 'Copied notes' });
    const fetchMock = renderTracker({ recent: [recent] });
    await openTracker();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    selectTab(/^recent$/i);
    await screen.findByText('Completed session');

    openMenuForSession();
    expect(screen.queryByText('Edit Session')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByText('Duplicate'));
    expect(toast.success).toHaveBeenCalledWith('Session settings copied');

    expect(screen.getByRole('tab', { name: /^current$/i })).toHaveAttribute(
      'data-state',
      'active'
    );
  });

  it('creates a task with the live API and automatically starts task mode', async () => {
    const fetchMock = renderTracker({
      boards: [
        {
          id: 'board-1',
          name: 'Product',
          created_at: '2026-08-10',
          task_lists: [
            {
              id: 'list-1',
              name: 'Doing',
              status: 'active',
              color: 'BLUE',
              position: 0,
            },
          ],
        },
      ],
    });
    await openTracker();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Task & Start Timer' })
    );
    fireEvent.change(await screen.findByLabelText('Task Name'), {
      target: { value: 'Created task' },
    });
    const boardSelect = comboboxBesideLabel('Board');
    fireEvent.pointerDown(boardSelect, {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('option', { name: 'Product' }));
    const listSelect = comboboxBesideLabel('List');
    fireEvent.pointerDown(listSelect, {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('option', { name: 'Doing' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Create & Start Timer' })
    );

    await waitFor(() => {
      const create = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/tasks') && init?.method === 'POST'
      );
      expect(JSON.parse(String(create?.[1]?.body))).toEqual({
        name: 'Created task',
        description: null,
        listId: 'list-1',
      });
      expect(create?.[1]?.credentials).toBe('include');
      const start = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/time-tracking/sessions') &&
          init?.method === 'POST'
      );
      expect(JSON.parse(String(start?.[1]?.body))).toMatchObject({
        title: 'Working on: Created task',
        taskId: 'task-created',
      });
    });
  });

  it('ticks elapsed time from the running session start', async () => {
    const now = new Date('2026-08-10T00:00:10.000Z').getTime();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    renderTracker({
      current: runningSession({ start_time: '2026-08-10T00:00:05.000Z' }),
    });
    await openTracker();
    await waitFor(() =>
      expect(screen.getAllByText('00:05')).not.toHaveLength(0)
    );

    nowSpy.mockReturnValue(now + 1_000);
    await waitFor(
      () => expect(screen.getAllByText('00:06')).not.toHaveLength(0),
      { timeout: 1500 }
    );
  });

  it('shows the live mutation failure toast without invalidating the sidebar', async () => {
    const fetchMock = renderTracker({ failMutation: true });
    await openTracker();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    selectTab(/manual/i);
    fireEvent.change(screen.getByPlaceholderText('What are you working on?'), {
      target: { value: 'Failing session' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start Timer' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to start timer')
    );
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('surfaces the live load failure toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'synthetic failure' }, 500))
    );
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TimeTracker wsId="workspace-1" />
      </QueryClientProvider>
    );

    await openTracker();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to load time tracking data'
      );
      expect(toast.error).toHaveBeenCalledWith('Failed to load boards');
    });
  });
});
