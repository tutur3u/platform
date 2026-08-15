// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleSetupDialog } from './schedule-setup-dialog';

const listSessions = vi.fn();
const createSession = vi.fn();
const updateSession = vi.fn();

vi.mock('@tuturuuu/internal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api')>()),
  createWorkspaceUserGroupSession: (...args: unknown[]) =>
    createSession(...args),
  listWorkspaceUserGroupSessions: (...args: unknown[]) => listSessions(...args),
  updateWorkspaceUserGroupSession: (...args: unknown[]) =>
    updateSession(...args),
}));

const labels: Record<string, string> = {
  cancel: 'Cancel',
  'days_of_week.friday': 'Friday',
  'days_of_week.monday': 'Monday',
  'days_of_week.saturday': 'Saturday',
  'days_of_week.sunday': 'Sunday',
  'days_of_week.thursday': 'Thursday',
  'days_of_week.tuesday': 'Tuesday',
  'days_of_week.wednesday': 'Wednesday',
  frequency_apply_update: 'Apply schedule update',
  frequency_review_changes: 'Review changes',
  group: 'Group',
  quick_weekly_back: 'Back to edit',
  quick_weekly_create: 'Create schedule',
  quick_weekly_review: 'Preview schedule',
  repeat_forever: 'Repeat forever',
  schedule_create_success: 'Created {count} recurring timeframes.',
  schedule_setup: 'Manage schedule',
  schedule_setup_choose_action: 'What do you want to do?',
  schedule_setup_create_description: 'Create another recurring plan.',
  schedule_setup_create_title: 'Create recurring schedule',
  schedule_setup_no_series: 'No recurring schedule yet.',
  schedule_setup_step_details: '1. Schedule details',
  schedule_setup_step_review: '2. Review',
  schedule_setup_update_description: 'Change future dates only.',
  schedule_setup_update_title: 'Update upcoming schedule',
  timeframe_end: 'Ends at',
  timeframe_start: 'Starts at',
  weekday_short: '',
};

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    (labels[key] ?? key).replace('{count}', String(values?.count ?? '')),
}));

vi.mock('@tuturuuu/ui/date-time-picker', () => ({
  DateTimePicker: ({ date }: { date?: Date }) => (
    <div data-testid="date-time-picker">{date?.toISOString()}</div>
  ),
}));

vi.mock('./session-timezone-combobox', () => ({
  SessionTimezoneCombobox: ({ value }: { value: string }) => (
    <div data-testid="timezone-combobox">{value}</div>
  ),
}));

function session(id: string, date: string): WorkspaceUserGroupSession {
  return {
    description: null,
    descriptionJson: null,
    endTimezone: 'Asia/Ho_Chi_Minh',
    endsAt: dayjs(`${date}T13:00:00.000Z`).toISOString(),
    files: [],
    groupId: '00000000-0000-4000-8000-000000000101',
    groupName: 'Math A1',
    id,
    recurrence: {
      daysOfWeek: [1, 3, 6],
      intervalWeeks: 1,
      startDate: '2026-08-17',
      untilDate: '2026-08-23',
    },
    recurrenceInstanceDate: date,
    seriesId: '00000000-0000-4000-8000-000000000201',
    source: 'admin',
    startTimezone: 'Asia/Ho_Chi_Minh',
    startsAt: dayjs(`${date}T12:00:00.000Z`).toISOString(),
    status: 'scheduled',
    tags: [],
    title: 'Math A1',
  };
}

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ScheduleSetupDialog
        canChooseGroup={false}
        defaultGroupId="00000000-0000-4000-8000-000000000101"
        groups={[
          { id: '00000000-0000-4000-8000-000000000101', name: 'Math A1' },
        ]}
        wsId="00000000-0000-4000-8000-000000000001"
      />
    </QueryClientProvider>
  );
}

describe('ScheduleSetupDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-15T02:00:00.000Z'));
    updateSession.mockResolvedValue({ data: [], message: 'success' });
    createSession.mockResolvedValue({ data: [], message: 'success' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates distinct Saturday and Sunday timeframes that repeat forever', async () => {
    listSessions.mockResolvedValue({ data: [], groups: [], tags: [] });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Manage schedule' }));
    expect(
      await screen.findByText('No recurring schedule yet.')
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveClass('w-[calc(100vw-1rem)]');
    expect(
      screen.getByRole('button', { name: /Update upcoming schedule/u })
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Saturday' }));
    fireEvent.click(screen.getByRole('button', { name: 'add_timeframe' }));
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Sunday' })[1]!);
    const startInputs = screen.getAllByLabelText('Starts at');
    const endInputs = screen.getAllByLabelText('Ends at');
    fireEvent.change(startInputs[1]!, { target: { value: '08:00' } });
    fireEvent.change(endInputs[1]!, { target: { value: '09:30' } });
    fireEvent.click(screen.getByRole('button', { name: /Repeat forever/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview schedule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(2));
    expect(createSession.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({
        recurrence: { daysOfWeek: [6], intervalWeeks: 1, untilDate: null },
      }),
      expect.objectContaining({
        recurrence: { daysOfWeek: [0], intervalWeeks: 1, untilDate: null },
      }),
    ]);
  });

  it('defaults to updating an existing series and reviews every future change', async () => {
    listSessions.mockResolvedValue({
      data: [
        session('monday', '2026-08-17'),
        session('wednesday', '2026-08-19'),
        session('saturday', '2026-08-22'),
      ],
      groups: [],
      tags: [],
    });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Manage schedule' }));
    await screen.findByRole('checkbox', { name: 'Monday' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Monday' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wednesday' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sunday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));

    expect(screen.getByText('Mon, Aug 17, 19:00')).toBeInTheDocument();
    expect(screen.getByText('Wed, Aug 19, 19:00')).toBeInTheDocument();
    expect(screen.getByText('Sun, Aug 23, 19:00')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Apply schedule update' })
    );
    await waitFor(() =>
      expect(updateSession).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        'monday',
        {
          recurrence: {
            daysOfWeek: [0, 6],
            intervalWeeks: 1,
            untilDate: '2026-08-23',
          },
          scope: 'future',
        }
      )
    );
  });
});
