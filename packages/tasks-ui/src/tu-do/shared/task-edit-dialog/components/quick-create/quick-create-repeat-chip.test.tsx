/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { NextIntlClientProvider } from 'next-intl';
import { type ComponentProps, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../../../../../apps/tasks/messages/en.json';
import vi_ from '../../../../../../../../apps/tasks/messages/vi.json';
import type { TaskRecurrenceChoice } from '../../../task-recurrence/task-recurrence-choice';
import type { QuickCreateRepeatModel } from '../../../task-recurrence/use-quick-create-recurrence';
import { QuickCreatePropertyChips } from './quick-create-property-chips';

vi.mock('../../../create-list-dialog', () => ({
  CreateListDialog: () => null,
}));

vi.mock('@tuturuuu/ui/hooks/use-calendar-preferences', () => ({
  useCalendarPreferences: () => ({
    weekStartsOn: 1,
    timezone: 'auto',
    timeFormat: '24h',
  }),
}));

type ChipProps = ComponentProps<typeof QuickCreatePropertyChips>;

const lists = [
  { id: 'list-1', name: 'Sprint backlog', status: 'active', position: 0 },
] as unknown as TaskList[];

const timing = {
  requestedDate: '2026-11-21',
  timeZone: 'Asia/Ho_Chi_Minh',
  dueTime: null,
  startOffsetDays: 0,
};

function props(overrides: Partial<ChipProps> = {}): ChipProps {
  const noop = vi.fn();
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
    availableLabels: [],
    taskProjects: [],
    workspaceMembers: [],
    boardConfig: null,
    onPriorityChange: noop,
    onStartDateChange: noop,
    onEndDateChange: noop,
    onEstimationChange: noop,
    onLabelToggle: noop,
    onProjectToggle: noop,
    onListChange: noop,
    onAssigneeToggle: noop,
    onQuickDueDate: noop,
    onShowNewLabelDialog: noop,
    onShowNewProjectDialog: noop,
    onShowEstimationConfigDialog: noop,
    ...overrides,
  };
}

function Harness({
  locale,
  overrides,
}: {
  locale: 'en' | 'vi';
  overrides?: Partial<ChipProps>;
}) {
  const [choice, setChoice] = useState<TaskRecurrenceChoice | null>(null);
  const repeat: QuickCreateRepeatModel = {
    choice,
    timing,
    locale: locale === 'en' ? 'en-US' : 'vi',
    onChange: setChoice,
  };
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? en : vi_}
      timeZone="UTC"
      onError={() => {}}
    >
      <QuickCreatePropertyChips {...props({ repeat, ...overrides })} />
    </NextIntlClientProvider>
  );
}

const chipIds = () =>
  Array.from(document.querySelectorAll('[data-quick-create-chip]')).map((el) =>
    el.getAttribute('data-quick-create-chip')
  );

const repeatChip = () =>
  document.querySelector<HTMLButtonElement>(
    '[data-quick-create-chip="repeat"]'
  );

describe('Quick-create Repeat chip', () => {
  it('is the last control when the API admits the actor', () => {
    render(<Harness locale="en" />);
    expect(chipIds().at(-1)).toBe('repeat');
    expect(repeatChip()).toHaveTextContent('Repeat');
  });

  it('is absent while ineligible or dormant, and for drafts', () => {
    const { unmount } = render(
      <Harness locale="en" overrides={{ repeat: null }} />
    );
    expect(chipIds()).not.toContain('repeat');
    unmount();
    render(<Harness locale="en" overrides={{ isDraftMode: true }} />);
    expect(chipIds()).not.toContain('repeat');
  });

  it('offers the presets and summarizes a pick on the chip', () => {
    render(<Harness locale="en" />);
    fireEvent.click(repeatChip()!);
    const list = screen.getByRole('listbox');
    for (const label of ['Daily', 'Weekdays', 'Weekly', 'Monthly', 'Custom'])
      expect(within(list).getByText(label)).toBeInTheDocument();
    fireEvent.click(within(list).getByText('Weekly'));
    expect(repeatChip()).toHaveTextContent('Weekly on Sat');
  });

  it('previews a custom rule and explains a skipped first date', () => {
    render(<Harness locale="en" />);
    fireEvent.click(repeatChip()!);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Custom'));
    fireEvent.click(screen.getByRole('radio', { name: 'Month' }));
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '31' } });

    const preview = screen.getByTestId('task-recurrence-preview');
    expect(within(preview).getAllByRole('listitem')).toHaveLength(3);
    expect(preview).toHaveTextContent('Mon, Nov 30');
    expect(preview).toHaveTextContent(
      "Sat, Nov 21 isn't a repeat date, so the first task is on Mon, Nov 30."
    );
    expect(
      screen.getByText('Uses the last day in shorter months')
    ).toBeInTheDocument();
  });

  it('renders Vietnamese copy', () => {
    render(<Harness locale="vi" />);
    expect(repeatChip()).toHaveTextContent('Lặp lại');
    fireEvent.click(repeatChip()!);
    const list = screen.getByRole('listbox');
    expect(within(list).getByText('Hằng ngày')).toBeInTheDocument();
    expect(within(list).getByText('Tùy chỉnh')).toBeInTheDocument();
  });
});
