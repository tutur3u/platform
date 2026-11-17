/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickCreatePropertyChips } from './quick-create-property-chips';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('../../../create-list-dialog', () => ({
  CreateListDialog: () => null,
}));

vi.mock('@tuturuuu/ui/hooks/use-calendar-preferences', () => ({
  useCalendarPreferences: () => ({
    weekStartsOn: 1,
    timezone: 'UTC',
    timeFormat: '24h',
  }),
}));

vi.mock('@tuturuuu/ui/date-time-picker', () => ({
  DateTimePicker: ({
    setDate,
  }: {
    setDate: (date: Date | undefined) => void;
  }) => (
    <button type="button" onClick={() => setDate(new Date(2026, 10, 20))}>
      Pick Nov 20
    </button>
  ),
}));

const Q = 'ws-task-boards.dialog.quick_create';

type ChipProps = ComponentProps<typeof QuickCreatePropertyChips>;

const lists = [
  { id: 'list-1', name: 'Sprint backlog', status: 'active', position: 0 },
] as unknown as TaskList[];

function createProps(overrides: Partial<ChipProps> = {}): ChipProps {
  return {
    wsId: 'ws-1',
    boardId: 'board-1',
    locale: 'en-US',
    priority: null,
    startDate: undefined,
    endDate: undefined,
    estimationPoints: null,
    selectedLabels: [],
    selectedProjects: [],
    selectedListId: 'list-1',
    selectedAssignees: [],
    isPersonalWorkspace: false,
    availableLists: lists,
    availableLabels: [
      { id: 'label-ci', name: 'ci', color: 'blue', created_at: '' },
      { id: 'label-cleanup', name: 'cleanup', color: 'orange', created_at: '' },
      { id: 'label-p1', name: 'p1', color: 'red', created_at: '' },
    ],
    taskProjects: [{ id: 'project-1', name: 'Platform' }],
    workspaceMembers: [{ user_id: 'user-1', display_name: 'Ada' }],
    boardConfig: { estimation_type: 'fibonacci' },
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
    ...overrides,
  };
}

function renderChips(
  overrides: Partial<ChipProps> = {},
  onOpenChange = vi.fn()
) {
  const props = createProps(overrides);
  render(
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Create task</DialogTitle>
        <DialogDescription>Fleet backlog</DialogDescription>
        <QuickCreatePropertyChips {...props} />
      </DialogContent>
    </Dialog>
  );
  return { props, onOpenChange };
}

function chip(id: string) {
  const element = document.querySelector<HTMLButtonElement>(
    `[data-quick-create-chip="${id}"]`
  );
  if (!element) throw new Error(`Missing chip ${id}`);
  return element;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('QuickCreatePropertyChips', () => {
  it('gives every property chip a visible label, in Tab order', () => {
    renderChips();

    const chips = Array.from(
      screen
        .getByTestId('quick-create-property-chips')
        .querySelectorAll('[data-quick-create-chip]')
    );
    const ids = chips.map((element) =>
      element.getAttribute('data-quick-create-chip')
    );

    expect(ids).toEqual([
      'list',
      'priority',
      'start',
      'due',
      'estimate',
      'labels',
      'project',
      'assignees',
    ]);
    for (const element of chips) {
      const id = element.getAttribute('data-quick-create-chip');
      expect(element.tagName).toBe('BUTTON');
      expect(element).toHaveTextContent(`${Q}.${id}`);
    }
  });

  it('shows set values next to the label and dashes empty chips', () => {
    renderChips({
      priority: 'high',
      endDate: new Date(2026, 10, 20),
      selectedLabels: [
        { id: 'label-p1', name: 'p1', color: 'red', created_at: '' },
      ],
    });

    expect(chip('list')).toHaveTextContent(`${Q}.listSprint backlog`);
    expect(chip('priority')).toHaveTextContent(
      `${Q}.prioritytasks.priority_high`
    );
    expect(chip('priority')).not.toHaveAttribute('data-empty');
    expect(chip('due')).toHaveTextContent('Fri, Nov 20');
    expect(chip('labels')).toHaveTextContent('p1');
    expect(chip('start')).toHaveAttribute('data-empty', 'true');
    expect(chip('start').className).toContain('border-dashed');
    expect(chip('estimate')).toHaveAttribute('data-empty', 'true');
  });

  it('hides Project for drafts and Assignees without board assignees', () => {
    renderChips({ isDraftMode: true, canUseBoardAssignees: false });

    expect(
      document.querySelector('[data-quick-create-chip="project"]')
    ).toBeNull();
    expect(
      document.querySelector('[data-quick-create-chip="assignees"]')
    ).toBeNull();
  });

  it('opens a picker that filters as you type and picks with Enter', () => {
    const { props } = renderChips();

    fireEvent.click(chip('labels'));
    const search = screen.getByPlaceholderText(`${Q}.search`);
    fireEvent.change(search, { target: { value: 'c' } });

    expect(screen.getByText('ci')).toBeTruthy();
    expect(screen.getByText('cleanup')).toBeTruthy();
    expect(screen.queryByText('p1')).not.toBeInTheDocument();

    fireEvent.keyDown(search, { key: 'Enter' });

    expect(props.onLabelToggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'label-ci' })
    );
  });

  it('picks a priority with its digit and closes the picker', () => {
    const { props } = renderChips();

    fireEvent.click(chip('priority'));
    fireEvent.keyDown(screen.getByPlaceholderText(`${Q}.search`), {
      key: '2',
    });

    expect(props.onPriorityChange).toHaveBeenCalledWith('high');
    expect(
      screen.queryByPlaceholderText(`${Q}.search`)
    ).not.toBeInTheDocument();
  });

  it('closes the open picker on Escape before the dialog', () => {
    const { onOpenChange } = renderChips();

    fireEvent.click(chip('priority'));
    const search = screen.getByPlaceholderText(`${Q}.search`);
    fireEvent.keyDown(search, { key: 'Escape' });

    expect(
      screen.queryByPlaceholderText(`${Q}.search`)
    ).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(chip('priority'), { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sets a due date at the end of the day and fills an empty start date', () => {
    const { props } = renderChips();

    fireEvent.click(chip('due'));
    fireEvent.click(screen.getByText('Pick Nov 20'));

    expect(props.onStartDateChange).toHaveBeenCalledTimes(1);
    const due = vi.mocked(props.onEndDateChange).mock.calls[0]?.[0];
    expect(due?.getHours()).toBe(23);
    expect(due?.getMinutes()).toBe(59);
  });

  it('offers due date shortcuts', () => {
    const { props } = renderChips();

    fireEvent.click(chip('due'));
    fireEvent.click(screen.getByRole('button', { name: 'common.tomorrow' }));

    expect(props.onQuickDueDate).toHaveBeenCalledWith(1);
  });
});
