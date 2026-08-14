/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskTimerMenuItem } from './task-timer-menu-item';

const {
  getRunningTimeTrackingSessionMock,
  startTaskTimeTrackingSessionMock,
  stopTaskTimeTrackingSessionMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  getRunningTimeTrackingSessionMock: vi.fn(),
  startTaskTimeTrackingSessionMock: vi.fn(),
  stopTaskTimeTrackingSessionMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}));

vi.mock('./task-time-tracking-api', () => ({
  getRunningTaskTimeTrackingSession: getRunningTimeTrackingSessionMock,
  runningTimeSessionQueryKey: (workspaceId: string) => [
    'running-time-session',
    workspaceId,
  ],
  startTaskTimeTrackingSession: startTaskTimeTrackingSessionMock,
  stopTaskTimeTrackingSession: stopTaskTimeTrackingSessionMock,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

function renderMenu(item: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DropdownMenu open>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>{item}</DropdownMenuContent>
      </DropdownMenu>
    </QueryClientProvider>
  );
}

describe('TaskTimerMenuItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRunningTimeTrackingSessionMock.mockResolvedValue(null);
    startTaskTimeTrackingSessionMock.mockResolvedValue({
      id: 'session-1',
      task_id: 'task-1',
    });
    stopTaskTimeTrackingSessionMock.mockResolvedValue({
      id: 'session-1',
      is_running: false,
      task_id: 'task-1',
    });
  });

  it('starts the selected task immediately through its tracking workspace', async () => {
    const onStarted = vi.fn();
    renderMenu(
      <TaskTimerMenuItem
        enabled
        onStarted={onStarted}
        taskDescription="Launch checklist"
        taskId="task-1"
        taskName="Prepare launch"
        workspaceId="source-workspace"
      />
    );

    fireEvent.click(await screen.findByText('start_tracking_time'));

    await waitFor(() =>
      expect(startTaskTimeTrackingSessionMock).toHaveBeenCalledWith(
        'source-workspace',
        {
          taskId: 'task-1',
          taskName: 'Prepare launch',
          description: 'Launch checklist',
        }
      )
    );
    expect(toastSuccessMock).toHaveBeenCalledWith('timer_started', {
      description: 'timer_started_for:Prepare launch',
    });
    expect(onStarted).toHaveBeenCalledOnce();
  });

  it('renders an immediate pending state while the session is being created', async () => {
    let resolveStart: ((value: unknown) => void) | undefined;
    startTaskTimeTrackingSessionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      })
    );
    renderMenu(
      <TaskTimerMenuItem
        taskId="task-1"
        taskName="Prepare launch"
        workspaceId="workspace-1"
      />
    );

    fireEvent.click(await screen.findByText('start_tracking_time'));

    expect(await screen.findByText('starting_timer')).toBeInTheDocument();
    expect(
      screen.getByText('starting_timer').closest('[role="menuitem"]')
    ).toHaveAttribute('aria-disabled', 'true');

    resolveStart?.({ id: 'session-1', task_id: 'task-1' });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });

  it('explains that starting this task switches the active timer', async () => {
    getRunningTimeTrackingSessionMock.mockResolvedValue({
      id: 'session-old',
      task_id: 'task-old',
    });
    renderMenu(
      <TaskTimerMenuItem
        taskId="task-1"
        taskName="Prepare launch"
        workspaceId="workspace-1"
      />
    );

    expect(
      await screen.findByText('switch_tracking_to_task')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('current_timer_will_stop')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('switch_tracking_to_task'));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    expect(toastSuccessMock).toHaveBeenCalledWith('timer_started', {
      description: 'timer_switched_to:Prepare launch',
    });
  });

  it('stops the already-running selected task immediately', async () => {
    getRunningTimeTrackingSessionMock.mockResolvedValue({
      id: 'session-1',
      task_id: 'task-1',
    });
    renderMenu(
      <TaskTimerMenuItem
        taskId="task-1"
        taskName="Prepare launch"
        workspaceId="workspace-1"
      />
    );

    const itemLabel = await screen.findByText('stop_tracking_time');
    expect(itemLabel.closest('[role="menuitem"]')).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.queryByText('timer_is_running')).not.toBeInTheDocument();
    fireEvent.click(itemLabel);
    await waitFor(() =>
      expect(stopTaskTimeTrackingSessionMock).toHaveBeenCalledWith(
        'workspace-1',
        'session-1'
      )
    );
    expect(toastSuccessMock).toHaveBeenCalledWith('timer_stopped', {
      description: 'timer_stopped_for:Prepare launch',
    });
    expect(startTaskTimeTrackingSessionMock).not.toHaveBeenCalled();
  });

  it('keeps the menu actionable after a failed request and explains the error', async () => {
    startTaskTimeTrackingSessionMock.mockRejectedValue(
      new Error('Workspace access denied')
    );
    renderMenu(
      <TaskTimerMenuItem
        taskId="task-1"
        taskName="Prepare launch"
        workspaceId="workspace-1"
      />
    );

    fireEvent.click(await screen.findByText('start_tracking_time'));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('failed_to_start_timer', {
        description: 'Workspace access denied',
      })
    );
  });
});
