import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiraFinanceArtifact } from './mira-finance-artifact';
import { MiraScheduleArtifact } from './mira-schedule-artifact';
import { calendarDayRows } from './mira-schedule-utils';
import { MiraTaskArtifact } from './mira-task-artifact';

vi.mock('@/lib/tasks-app-url-client', () => ({
  getTasksAppUrlClient: (path: string) => `https://tasks.tuturuuu.com${path}`,
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.name ? `${key}: ${values.name}` : key,
  useFormatter: () => ({
    number: (value: number) => String(value),
    dateTime: (value: Date) => value.toISOString(),
  }),
}));

describe('compact artifact interactions', () => {
  afterEach(() => vi.useRealTimers());
  it('filters the agenda by day and restores the full week', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 12, 12));
    render(
      <MiraScheduleArtifact
        rows={[
          {
            id: 'today',
            title: 'Today event',
            date: new Date(2026, 8, 12, 14).toISOString(),
            endDate: new Date(2026, 8, 12, 15).toISOString(),
          },
          {
            id: 'tomorrow',
            title: 'Tomorrow event',
            date: new Date(2026, 8, 13, 14).toISOString(),
            endDate: new Date(2026, 8, 13, 15).toISOString(),
          },
        ]}
      />
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: `${new Date(2026, 8, 12).toISOString()}, event_count`,
      })
    );
    expect(screen.getByText('Today event')).toBeInTheDocument();
    expect(screen.queryByText('Tomorrow event')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'show_week' }));
    expect(screen.getByText('Tomorrow event')).toBeInTheDocument();
  });
  it('filters task urgency without losing the other groups', () => {
    render(
      <MiraTaskArtifact
        rows={[
          {
            id: 'one',
            title: 'Late task',
            group: 'overdue',
            path: '/team/boards/board?task=one',
          },
          { id: 'two', title: 'Today task', group: 'today' },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /overdue/ }));
    expect(screen.queryByText('Today task')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Late task/ })).toHaveAttribute(
      'href',
      'https://tasks.tuturuuu.com/en/team/boards/board?task=one'
    );
    fireEvent.click(screen.getByRole('button', { name: /overdue/ }));
    expect(screen.getByText('Today task')).toBeInTheDocument();
  });
  it('keeps currencies separate and compares magnitudes for negative balances', () => {
    render(
      <MiraFinanceArtifact
        rows={[
          { id: 'usd', title: 'Cash', amount: 100, currency: 'USD' },
          { id: 'debt', title: 'Debt', amount: -50, currency: 'USD' },
          { id: 'vnd', title: 'Local', amount: 1000, currency: 'VND' },
        ]}
      />
    );
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('-50')).toBeInTheDocument();
    expect(screen.queryByText('1050')).not.toBeInTheDocument();
    expect(
      Number(
        screen
          .getByRole('meter', { name: 'balance_share: Debt' })
          .getAttribute('value')
      )
    ).toBeCloseTo(100 / 3);
  });
});

describe('calendar day overlap', () => {
  it('shows a multi-day event on both days but excludes its exclusive end day', () => {
    const days = [
      new Date(2026, 8, 12),
      new Date(2026, 8, 13),
      new Date(2026, 8, 14),
    ];
    const rows = calendarDayRows(
      [
        {
          id: 'trip',
          title: 'Trip',
          date: new Date(2026, 8, 11).toISOString(),
          endDate: new Date(2026, 8, 14).toISOString(),
        },
      ],
      days
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.allDay)).toBe(true);
    expect(rows[0]?.date).toBe(days[0]?.toISOString());
    expect(rows[1]?.date).toBe(days[1]?.toISOString());
  });
  it('ignores invalid dates instead of crashing the agenda', () => {
    expect(
      calendarDayRows(
        [{ id: 'bad', title: 'Bad', date: 'invalid' }],
        [new Date(2026, 8, 12)]
      )
    ).toEqual([]);
  });
});
