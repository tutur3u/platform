import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  openModal: vi.fn(),
  addEmptyEvent: vi.fn(),
  events: [] as CalendarEvent[],
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({
    ...state,
    getCurrentEvents: (day: Date) =>
      state.events.filter(
        (event) =>
          new Date(event.start_at).toDateString() === day.toDateString()
      ),
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar-preferences', () => ({
  useCalendarPreferences: () => ({ timeFormat: '24h' }),
}));
vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserBooleanConfig: () => ({ value: false }),
}));
vi.mock('./settings/settings-context', () => ({
  useCalendarSettings: () => ({
    settings: {
      appearance: { showWeekends: true },
      timezone: { timezone: 'America/New_York' },
    },
  }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    `${key}${values ? ` ${Object.values(values).join(' ')}` : ''}`,
}));

import { AgendaView } from './agenda-view';
import { MonthCalendar } from './month-calendar';
import { YearCalendar } from './year-calendar';

const date = new Date(2026, 8, 7);
beforeEach(() => {
  state.openModal.mockClear();
  state.addEmptyEvent.mockClear();
  state.events = Array.from(
    { length: 5 },
    (_, i) =>
      ({
        id: String(i),
        title: `Event ${i}`,
        start_at: new Date(2026, 8, 7, 9 + i).toISOString(),
        end_at: new Date(2026, 8, 7, 10 + i).toISOString(),
        color: 'BLUE',
        location: i === 4 ? 'Library' : undefined,
      }) as CalendarEvent
  );
});
describe('calendar view interactions', () => {
  it('month overflow opens every event and creates on the chosen calendar date and timezone', () => {
    render(<MonthCalendar date={date} viewedMonth={date} locale="en" />);
    const day = screen.getByRole('region', {
      name: date.toLocaleDateString('en', { dateStyle: 'full' }),
    });
    expect(within(day).getAllByRole('button', { name: /Event/ })).toHaveLength(
      3
    );
    fireEvent.click(
      within(day).getByRole('button', { name: /views.open_day/ })
    );
    fireEvent.click(screen.getByRole('button', { name: /Event 4/ }));
    expect(state.openModal).toHaveBeenCalledWith('4');
    fireEvent.click(
      within(day).getByRole('button', { name: /views.create_on_date/ })
    );
    expect(state.addEmptyEvent.mock.calls[0]?.[0].toISOString()).toBe(
      '2026-09-07T13:00:00.000Z'
    );
  });
  it('agenda filters by location, opens events, and clears a no-match search', () => {
    render(<AgendaView startDate={date} locale="vi" />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Library' },
    });
    expect(screen.getByText('Event 4')).toBeVisible();
    expect(screen.queryByText('Event 0')).toBeNull();
    fireEvent.click(screen.getByText('Event 4'));
    expect(state.openModal).toHaveBeenCalledWith('4');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'No match' },
    });
    expect(screen.getByText('views.no_matches')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'views.clear_search' }));
    expect(screen.getByText('Event 0')).toBeVisible();
  });
  it('year localizes month labels and supports month and day drill-down', () => {
    const onMonthClick = vi.fn();
    const onDayClick = vi.fn();
    render(
      <YearCalendar
        year={2026}
        locale="vi"
        onMonthClick={onMonthClick}
        onDayClick={onDayClick}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^Tháng 9/i }));
    expect(onMonthClick.mock.calls[0]?.[0].getMonth()).toBe(8);
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(date.toLocaleDateString('vi', { dateStyle: 'full' })),
      })
    );
    expect(onDayClick.mock.calls[0]?.[0].getDate()).toBe(7);
  });
});
