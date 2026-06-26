/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
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

function renderTaskPropertiesSection() {
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
    taskProjects: [],
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
  it('keeps only one property popover open at a time', () => {
    renderTaskPropertiesSection();

    fireEvent.click(screen.getByLabelText('common.priority'));
    expect(screen.getByText('tasks.priority_critical')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('common.labels'));
    expect(
      screen.queryByText('tasks.priority_critical')
    ).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('common.search_labels')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('common.list_name_to_do'));
    expect(
      screen.queryByPlaceholderText('common.search_labels')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('common.list_name_to_do')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });
});
