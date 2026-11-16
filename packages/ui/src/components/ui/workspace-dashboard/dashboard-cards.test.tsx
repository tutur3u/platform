import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getUserTaskDashboard: vi.fn(),
  listWorkspaceCalendarEvents: vi.fn(),
  completeCurrentUserTask: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getUserTaskDashboard: api.getUserTaskDashboard,
  completeCurrentUserTask: api.completeCurrentUserTask,
  TaskCompletionUnavailableError: class extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  },
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: api.toastError, success: api.toastSuccess },
}));
vi.mock('@tuturuuu/internal-api/calendar', () => ({
  listWorkspaceCalendarEvents: api.listWorkspaceCalendarEvents,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations:
    () => (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
}));

import { MyTasksCard } from './my-tasks-card';
import { NextUpCard } from './next-up-card';
import { TodayAgendaCard } from './today-agenda-card';

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

const longName =
  'Prepare the quarterly launch checklist for every regional marketing team and partner';

describe('MyTasksCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('announces loading, then lists tasks as keyboard-reachable links', async () => {
    api.getUserTaskDashboard.mockResolvedValue({
      overdue: [
        {
          id: 't1',
          name: longName,
          end_date: new Date(Date.now() - 3 * 86400000).toISOString(),
          list: { name: 'List', board: { id: 'b1', ws_id: 'ws1', name: 'Web' } },
        },
      ],
      today: [],
      upcoming: [],
      totalActiveTasks: 1,
    });
    wrap(<MyTasksCard
        wsId="ws1"
        isPersonal={false}
        tasksHref="https://tasks/ws1/tasks"
        newTaskHref="https://tasks/ws1/tasks/new"
      />);

    expect(screen.getByRole('status')).toHaveTextContent('loading');
    const link = await screen.findByRole('link', { name: new RegExp(longName) });
    expect(link).toHaveAttribute('href', '/ws1/boards/b1?task=t1');
    expect(link).toHaveAttribute('title', longName);
    expect(screen.getByRole('region', { name: 'my_tasks' })).toBeInTheDocument();

    // Native links in document order: header action first, then rows.
    const links = screen.getAllByRole('link');
    expect(links.map((el) => el.getAttribute('href'))).toEqual([
      'https://tasks/ws1/tasks/new',
      'https://tasks/ws1/tasks',
      '/ws1/boards/b1?task=t1',
    ]);
    link.focus();
    expect(link).toHaveFocus();
    expect(screen.getByText('days_late:{"count":3}')).toBeInTheDocument();
    expect(api.getUserTaskDashboard).toHaveBeenCalledWith({
      wsId: 'ws1',
      isPersonal: false,
    });
  });

  it('completes a task in place and restores it when the write fails', async () => {
    const overdueTask = {
      id: 't1',
      name: 'Review onboarding copy',
      end_date: null,
      list: { name: 'List', board: { id: 'b1', ws_id: 'ws1', name: 'Web' } },
    };
    api.getUserTaskDashboard.mockResolvedValue({
      overdue: [overdueTask],
      today: [],
      upcoming: [],
      totalActiveTasks: 1,
    });
    let reject: (error: Error) => void = () => {};
    api.completeCurrentUserTask.mockImplementationOnce(
      () => new Promise((_, rej) => (reject = rej))
    );
    wrap(<MyTasksCard wsId="ws1" isPersonal={false} tasksHref="/t" newTaskHref="/t/new" />);

    const button = await screen.findByRole('button', {
      name: 'complete_task:{"name":"Review onboarding copy"}',
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.queryByText('Review onboarding copy')).not.toBeInTheDocument()
    );
    expect(api.completeCurrentUserTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' })
    );

    reject(new Error('down'));
    expect(await screen.findByText('Review onboarding copy')).toBeInTheDocument();
    expect(api.toastError).toHaveBeenCalledWith('complete_task_failed');
  });

  it('offers no complete control for tasks the user handed off', async () => {
    api.getUserTaskDashboard.mockResolvedValue({
      overdue: [],
      today: [
        {
          id: 't2',
          name: 'Handed off',
          end_date: null,
          overrides: { personally_unassigned: true },
          list: { name: 'L', board: { id: 'b1', ws_id: 'ws1', name: 'Web' } },
        },
      ],
      upcoming: [],
      totalActiveTasks: 1,
    });
    wrap(<MyTasksCard wsId="ws1" isPersonal tasksHref="/t" newTaskHref="/t/new" />);

    expect(await screen.findByText('Handed off')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /complete_task/ })).toBeNull();
  });

  it('fails alone with an alert and recovers on Retry', async () => {
    api.getUserTaskDashboard
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ overdue: [], today: [], upcoming: [], totalActiveTasks: 0 });
    wrap(<MyTasksCard wsId="ws1" isPersonal tasksHref="/tasks" newTaskHref="/tasks/new" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('tasks_error');
    fireEvent.click(screen.getByRole('button', { name: /retry/ }));
    expect(await screen.findByText('no_open_tasks')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('TodayAgendaCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requests only the local day and shows the empty state', async () => {
    api.listWorkspaceCalendarEvents.mockResolvedValue({ data: [], count: 0 });
    wrap(<TodayAgendaCard wsId="ws1" calendarHref="/calendar" />);

    expect(await screen.findByText('no_events_today')).toBeInTheDocument();
    // New event opens Calendar's own draft through its one-shot entry.
    for (const link of screen.getAllByRole('link', { name: /new_event/ })) {
      expect(link).toHaveAttribute('href', '/calendar?create=event');
    }
    const [wsId, query] = api.listWorkspaceCalendarEvents.mock.calls[0]!;
    expect(wsId).toBe('ws1');
    const span =
      new Date(query.end_at).getTime() - new Date(query.start_at).getTime();
    expect(span).toBeGreaterThanOrEqual(23 * 3600000);
    expect(span).toBeLessThanOrEqual(25 * 3600000);
  });

  it('shows an error with Retry without hiding the card', async () => {
    api.listWorkspaceCalendarEvents.mockRejectedValue(new Error('down'));
    wrap(<TodayAgendaCard wsId="ws1" calendarHref="/calendar" />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('agenda_error')
    );
    expect(screen.getByRole('region', { name: 'agenda_title' })).toBeInTheDocument();
  });
});

describe('NextUpCard event cell', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the real Calendar event and offers no Join without a conference link', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 16, 12, 0), shouldAdvanceTime: true });
    const start = new Date(2026, 10, 16, 14, 0);
    const end = new Date(2026, 10, 16, 14, 30);
    api.listWorkspaceCalendarEvents.mockResolvedValue({
      data: [
        {
          id: 'evt 1',
          title: 'Weekly planning',
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          location: 'https://meet.example/room',
        },
      ],
      count: 1,
    });
    wrap(
      <NextUpCard
        wsId="ws1"
        isPersonal={false}
        showEvent
        showTask={false}
        showTime={false}
        calendarHref="https://calendar/ws1"
      />
    );

    const link = await screen.findByRole('link', { name: 'Weekly planning' });
    expect(link).toHaveAttribute('href', 'https://calendar/ws1?eventId=evt%201');
    // CalendarEvent has no conference-link field; a location URL is not one.
    expect(screen.queryByRole('link', { name: /join/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /join/i })).toBeNull();
    vi.useRealTimers();
  });
});
