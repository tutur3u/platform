/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskPropertiesSection } from './task-properties-section';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/date-time-picker', () => ({
  DateTimePicker: () => <button type="button">date-time-picker</button>,
}));

vi.mock('@tuturuuu/ui/hooks/use-calendar-preferences', () => ({
  useCalendarPreferences: () => ({
    weekStartsOn: 1,
    timezone: 'UTC',
    timeFormat: '24h',
  }),
}));

function renderTaskPropertiesSection(
  overrides: Partial<ComponentProps<typeof TaskPropertiesSection>> = {}
) {
  const props = {
    wsId: 'ws-1',
    boardId: 'board-1',
    taskId: 'task-1',
    priority: null,
    startDate: undefined,
    endDate: undefined,
    estimationPoints: null,
    selectedLabels: [],
    selectedProjects: [],
    selectedListId: 'list-1',
    selectedAssignees: [],
    isLoading: false,
    isPersonalWorkspace: false,
    canUseBoardAssignees: true,
    isCreateMode: false,
    totalDuration: null,
    isSplittable: false,
    minSplitDurationMinutes: null,
    maxSplitDurationMinutes: null,
    calendarHours: null,
    autoSchedule: false,
    savedSchedulingSettings: undefined,
    scheduledEvents: [],
    availableLists: [
      {
        id: 'list-1',
        board_id: 'board-1',
        name: 'To Do',
        status: 'not_started',
        color: 'GRAY',
        position: 0,
        archived: false,
        deleted: false,
        created_at: '2026-01-01T00:00:00.000Z',
        creator_id: 'user-1',
      },
    ] satisfies TaskList[],
    availableLabels: [
      {
        id: 'label-1',
        name: 'Bug',
        color: '#ef4444',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    taskProjects: [
      {
        id: 'project-1',
        name: 'Launch',
        status: 'active',
      },
    ],
    workspaceMembers: [
      {
        id: 'user-1',
        user_id: 'user-1',
        display_name: 'Taylor',
        email: 'taylor@example.com',
      },
    ],
    boardConfig: {},
    onPriorityChange: vi.fn(),
    onStartDateChange: vi.fn(),
    onEndDateChange: vi.fn(),
    onEstimationChange: vi.fn(),
    onLabelToggle: vi.fn(),
    onProjectToggle: vi.fn(),
    onListChange: vi.fn(),
    onAssigneeToggle: vi.fn(),
    onQuickDueDate: vi.fn(),
    onShowNewLabelDialog: vi.fn(),
    onShowNewProjectDialog: vi.fn(),
    onShowEstimationConfigDialog: vi.fn(),
    onTotalDurationChange: vi.fn(),
    onIsSplittableChange: vi.fn(),
    onMinSplitDurationChange: vi.fn(),
    onMaxSplitDurationChange: vi.fn(),
    onCalendarHoursChange: vi.fn(),
    onAutoScheduleChange: vi.fn(),
    onSaveSchedulingSettings: vi.fn().mockResolvedValue(true),
    schedulingSaving: false,
    disabled: false,
    isDraftMode: false,
    variant: 'compact' as const,
    ...overrides,
  };

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <TaskPropertiesSection {...props} />
    </QueryClientProvider>
  );

  return props;
}

describe('TaskPropertiesSection', () => {
  it('keeps only one property popover open at a time', async () => {
    renderTaskPropertiesSection();

    fireEvent.click(screen.getByLabelText('common.priority'));
    expect(screen.getByText('tasks.priority_critical')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('common.labels'));
    await waitFor(() =>
      expect(
        screen.queryByText('tasks.priority_critical')
      ).not.toBeInTheDocument()
    );
    expect(
      screen.queryByText('tasks.priority_critical')
    ).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('common.search_labels')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('common.list_name_to_do'));
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText('common.search_labels')
      ).not.toBeInTheDocument()
    );
    expect(
      screen.queryByPlaceholderText('common.search_labels')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('common.list_name_to_do')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('switches from priority to dates without closing the target popover', async () => {
    renderTaskPropertiesSection();

    fireEvent.click(screen.getByLabelText('common.priority'));
    expect(screen.getByText('tasks.priority_critical')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('ws-task-boards.dialog.dates'));

    await waitFor(() =>
      expect(
        screen.getByText('ws-task-boards.dialog.start_date')
      ).toBeInTheDocument()
    );
    expect(
      screen.getByText('ws-task-boards.dialog.due_date')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('tasks.priority_critical')
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      triggerLabel: 'common.labels',
      targetPlaceholder: 'common.search_labels',
    },
    {
      triggerLabel: 'common.projects',
      targetPlaceholder: 'common.search_projects',
    },
    {
      triggerLabel: 'common.assignees',
      targetPlaceholder: 'common.search_members',
    },
  ])('switches from priority to $triggerLabel and keeps the target popover open', async ({
    targetPlaceholder,
    triggerLabel,
  }) => {
    renderTaskPropertiesSection();

    fireEvent.click(screen.getByLabelText('common.priority'));
    expect(screen.getByText('tasks.priority_critical')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(triggerLabel));

    await waitFor(() =>
      expect(screen.getByPlaceholderText(targetPlaceholder)).toBeInTheDocument()
    );
    expect(
      screen.queryByText('tasks.priority_critical')
    ).not.toBeInTheDocument();
  });

  it('closes the priority popover after selecting a priority', () => {
    const props = renderTaskPropertiesSection();

    fireEvent.click(screen.getByLabelText('common.priority'));
    fireEvent.click(screen.getByText('tasks.priority_high'));

    expect(props.onPriorityChange).toHaveBeenCalledWith('high');
    expect(
      screen.queryByText('tasks.priority_critical')
    ).not.toBeInTheDocument();
  });

  it('keeps labels popover open after toggling a label', () => {
    const props = renderTaskPropertiesSection();

    fireEvent.click(screen.getByLabelText('common.labels'));
    fireEvent.click(screen.getByText('Bug'));

    expect(props.onLabelToggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'label-1' })
    );
    expect(
      screen.getByPlaceholderText('common.search_labels')
    ).toBeInTheDocument();
  });

  it('keeps projects popover open after toggling a project', () => {
    const props = renderTaskPropertiesSection();

    fireEvent.click(screen.getByLabelText('common.projects'));
    fireEvent.click(screen.getByText('Launch'));

    expect(props.onProjectToggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project-1' })
    );
    expect(
      screen.getByPlaceholderText('common.search_projects')
    ).toBeInTheDocument();
  });

  it('keeps assignees popover open after toggling an assignee', () => {
    const props = renderTaskPropertiesSection();

    fireEvent.click(screen.getByLabelText('common.assignees'));
    fireEvent.click(screen.getByText('Taylor'));

    expect(props.onAssigneeToggle).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1' })
    );
    expect(
      screen.getByPlaceholderText('common.search_members')
    ).toBeInTheDocument();
  });

  it('closes the active popover when clicking outside', async () => {
    renderTaskPropertiesSection();

    fireEvent.click(screen.getByLabelText('common.labels'));
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText('common.search_labels')
      ).toBeInTheDocument()
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body, {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.mouseDown(document.body, { button: 0, ctrlKey: false });
    fireEvent.click(document.body);

    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText('common.search_labels')
      ).not.toBeInTheDocument()
    );
  });
});
