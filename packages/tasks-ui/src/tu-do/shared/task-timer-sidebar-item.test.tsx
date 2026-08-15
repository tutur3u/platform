/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskTimerSidebarItem } from './task-timer-sidebar-item';

const mocks = vi.hoisted(() => ({
  getRunning: vi.fn(),
  stopRunning: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}));

vi.mock('./task-time-tracking-api', () => ({
  getRunningTaskTimeTrackingSession: mocks.getRunning,
  runningUserTimeSessionQueryKey: (workspaceId: string) => [
    'running-time-session',
    'user',
    workspaceId,
  ],
  runningTimeSessionQueryKey: (workspaceId: string) => [
    'running-time-session',
    workspaceId,
  ],
  stopTaskTimeTrackingSession: mocks.stopRunning,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: mocks.toastSuccess },
}));

function renderSidebar(isCollapsed = false) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TaskTimerSidebarItem isCollapsed={isCollapsed} workspaceId="personal" />
    </QueryClientProvider>
  );
}

describe('TaskTimerSidebarItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRunning.mockResolvedValue({
      id: 'session-1',
      task_id: 'task-1',
      task: {
        board_id: 'source-board',
        id: 'task-1',
        name: 'Prepare launch',
      },
      title: 'Working on: Prepare launch',
      ws_id: 'source-workspace',
    });
    mocks.stopRunning.mockResolvedValue({
      id: 'session-1',
      is_running: false,
      task_id: 'task-1',
    });
  });

  it('shows the tracked task and stops it from the expanded sidebar', async () => {
    renderSidebar();

    expect(await screen.findByText('Prepare launch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'stop_tracking_time' }));

    await waitFor(() =>
      expect(mocks.stopRunning).toHaveBeenCalledWith(
        'source-workspace',
        'session-1'
      )
    );
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('hides the tracked task before the stop request settles', async () => {
    let resolveStop: ((value: unknown) => void) | undefined;
    mocks.stopRunning.mockReturnValue(
      new Promise((resolve) => {
        resolveStop = resolve;
      })
    );
    renderSidebar();

    expect(await screen.findByText('Prepare launch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'stop_tracking_time' }));

    await waitFor(() =>
      expect(screen.queryByText('Prepare launch')).not.toBeInTheDocument()
    );

    resolveStop?.({ id: 'session-1', is_running: false });
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
  });

  it('keeps the task name available in a tooltip when collapsed', async () => {
    renderSidebar(true);

    const trigger = await screen.findByRole('button', {
      name: 'tracking_task_named:Prepare launch',
    });
    expect(trigger).toHaveClass('w-full', 'justify-center');
    fireEvent.focus(trigger);

    expect(await screen.findByText('Prepare launch')).toBeInTheDocument();
  });

  it('keeps a truncated expanded task name discoverable and actionable', async () => {
    renderSidebar();

    const taskButton = await screen.findByRole('button', {
      name: 'tracking_task_named:Prepare launch',
    });
    fireEvent.focus(taskButton);
    expect(await screen.findAllByText('Prepare launch')).toHaveLength(2);

    fireEvent.click(taskButton);

    expect(
      screen.getByRole('dialog', {
        name: 'tracking_task_named:Prepare launch',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'view_task' }).getAttribute('href')
    ).toMatch(/\/source-workspace\/boards\/source-board\?task=task-1$/u);

    fireEvent.click(screen.getByRole('button', { name: 'stop_tracking_time' }));
    await waitFor(() =>
      expect(mocks.stopRunning).toHaveBeenCalledWith(
        'source-workspace',
        'session-1'
      )
    );
  });
});
