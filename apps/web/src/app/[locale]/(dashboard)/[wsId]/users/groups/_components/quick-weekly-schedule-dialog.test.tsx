// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickWeeklyScheduleDialog } from './quick-weekly-schedule-dialog';

vi.mock('next-intl', () => {
  const messages: Record<string, Record<string, string>> = {
    common: {
      cancel: 'Cancel',
      'days_of_week.saturday': 'Saturday',
      'days_of_week.sunday': 'Sunday',
      'days_of_week.monday': 'Monday',
      'days_of_week.tuesday': 'Tuesday',
      'days_of_week.wednesday': 'Wednesday',
      'days_of_week.thursday': 'Thursday',
      'days_of_week.friday': 'Friday',
    },
    'ws-user-group-schedule': {
      days_of_week: 'Days of week',
      end_time: 'End time',
      group: 'Group',
      interval_weeks: 'Interval (weeks)',
      no_timezones_found: 'No timezones found',
      quick_weekly_back: 'Back to edit',
      quick_weekly_confirm_description:
        'Review the first generated dates before creating.',
      quick_weekly_create: 'Create schedule',
      quick_weekly_first_dates: 'First generated dates',
      quick_weekly_interval: 'Every {count} week(s)',
      quick_weekly_no_dates: 'No dates match this pattern.',
      quick_weekly_offset: 'UTC/GMT offset',
      quick_weekly_review: 'Preview schedule',
      quick_weekly_session_count: '{count} sessions',
      quick_weekly_setup: 'Quick weekly setup',
      quick_weekly_setup_description: 'Set up weekly sessions quickly.',
      search_timezone: 'Search timezone...',
      select_timezone: 'Select timezone',
      start_time: 'Start time',
      timezone: 'Timezone',
      until_date: 'Until date',
      untitled_session: 'Session',
    },
  };

  return {
    useLocale: () => 'en',
    useTranslations:
      (namespace: string) =>
      (key: string, values?: Record<string, unknown>) => {
        const value = messages[namespace]?.[key] ?? key;
        return values
          ? value.replace(/\{(\w+)\}/gu, (_match, name) =>
              String(values[name] ?? `{${name}}`)
            )
          : value;
      },
  };
});

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

describe('QuickWeeklyScheduleDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-19T02:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('previews then submits the default weekly schedule', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <QuickWeeklyScheduleDialog
        canChooseGroup={false}
        defaultGroupId="00000000-0000-4000-8000-000000000101"
        groups={[
          {
            id: '00000000-0000-4000-8000-000000000101',
            name: 'Math A1',
          },
        ]}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Quick weekly setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview schedule' }));

    expect(await screen.findByText('UTC/GMT +07:00')).toBeInTheDocument();
    expect(screen.getByText('157 sessions')).toBeInTheDocument();
    expect(screen.getByText('Sat, Jun 20, 19:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        endTimezone: 'Asia/Ho_Chi_Minh',
        endsAt: '2026-06-19T13:30:00.000Z',
        groupId: '00000000-0000-4000-8000-000000000101',
        recurrence: {
          daysOfWeek: [2, 4, 6],
          intervalWeeks: 1,
          untilDate: '2027-06-19',
        },
        startTimezone: 'Asia/Ho_Chi_Minh',
        startsAt: '2026-06-19T12:00:00.000Z',
        title: 'Math A1',
      });
    });
  });
});
