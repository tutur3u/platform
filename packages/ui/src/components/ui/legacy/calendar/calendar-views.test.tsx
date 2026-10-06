import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCalendarEventLookup } from '../../../../hooks/calendar-event-lookup';

const state = vi.hoisted(() => ({
  openModal: vi.fn(),
  addEmptyEvent: vi.fn(),
  events: [] as CalendarEvent[],
  weekStartsOn: 0,
  zone: 'America/New_York',
  useZonedLookup: false,
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({
    ...state,
    getCurrentEvents: (day: Date) =>
      state.useZonedLookup
        ? createCalendarEventLookup(state.events, state.zone)(day)
        : state.events.filter(
            (event) =>
              new Date(event.start_at).toDateString() === day.toDateString()
          ),
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar-preferences', () => ({
  useCalendarPreferences: () => ({
    timeFormat: '24h',
    weekStartsOn: state.weekStartsOn,
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserBooleanConfig: () => ({ value: false }),
}));
vi.mock('./settings/settings-context', () => ({
  useCalendarSettings: () => ({
    settings: {
      appearance: { showWeekends: true },
      timezone: { timezone: state.zone },
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
  state.weekStartsOn = 0;
  state.zone = 'America/New_York';
  state.useZonedLookup = false;
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
afterEach(() => vi.useRealTimers());

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
  it('uses the preferred first weekday unless visible dates specify one', () => {
    const { rerender } = render(<MonthCalendar date={date} locale="en" />);
    expect(screen.getAllByRole('region')[0]).toHaveAccessibleName(
      'Sunday, August 30, 2026'
    );
    state.weekStartsOn = 1;
    rerender(<MonthCalendar date={date} locale="en" />);
    expect(screen.getAllByRole('region')[0]).toHaveAccessibleName(
      'Monday, August 31, 2026'
    );
    rerender(
      <MonthCalendar
        date={date}
        locale="en"
        visibleDates={[new Date(2026, 8, 6)]}
      />
    );
    expect(screen.getAllByRole('region')[0]).toHaveAccessibleName(
      'Sunday, September 6, 2026'
    );
  });
  it('formats month events in the selected timezone', () => {
    state.events = [
      {
        id: 'zoned',
        title: 'Zoned',
        start_at: '2026-09-07T13:00:00Z',
        end_at: '2026-09-07T14:00:00Z',
      },
    ];
    render(<MonthCalendar date={date} locale="en" />);
    expect(screen.getByRole('button', { name: /Zoned/ })).toHaveTextContent(
      '09:00'
    );
  });
  it('disables read-only creation and uses 9am calendar time for agenda drafts', () => {
    const { rerender } = render(<AgendaView startDate={date} readOnly />);
    const create = screen.getByRole('button', { name: 'views.create_event' });
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(state.addEmptyEvent).not.toHaveBeenCalled();
    rerender(<AgendaView startDate={date} />);
    fireEvent.click(screen.getByRole('button', { name: 'views.create_event' }));
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
  it.each([
    ['America/New_York', '2026-09-08T01:00:00Z', 7],
    ['Asia/Tokyo', '2026-09-07T23:00:00Z', 8],
  ])('marks the calendar Today in month and year for %s', (zone, now, day) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    state.zone = zone;
    const { container, unmount } = render(
      <MonthCalendar date={date} locale="en" />
    );
    expect(container.querySelector('[aria-current="date"]')).toHaveTextContent(
      String(day)
    );
    unmount();
    const year = render(<YearCalendar year={2026} locale="en" />);
    expect(
      year.container.querySelector('[aria-current="date"]')
    ).toHaveAccessibleName(new RegExp(`September ${day}, 2026`));
  });
  it('uses the calendar Today and event clock in agenda', () => {
    state.useZonedLookup = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T01:00:00Z'));
    state.events = [
      {
        id: 'evening',
        title: 'Evening',
        start_at: '2026-09-07T23:00:00Z',
        end_at: '2026-09-08T00:00:00Z',
      },
    ];
    render(<AgendaView startDate={date} daysToShow={1} locale="en" />);
    expect(screen.getByText('today')).toBeVisible();
    expect(screen.getByRole('button', { name: /Evening/ })).toHaveTextContent(
      '19:00'
    );
  });
});

describe('calendar view opaque effective colors', () => {
  it.each([false, true])(
    'preserves provider contrast and accessible month treatment, past=%s',
    (past) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, past ? 8 : 7, 9));
      state.events = [
        {
          id: 'borderline-rgb',
          title: 'Borderline RGB',
          color: 'BLUE',
          start_at: new Date(2026, 8, 7, 10).toISOString(),
          end_at: new Date(2026, 8, 7, 11).toISOString(),
          scheduling_metadata: {
            google_color: {
              version: 1,
              inherited: false,
              background: '#757575',
            },
          },
        },
      ];
      render(<MonthCalendar date={date} viewedMonth={date} locale="en" />);
      const card = screen.getByRole('button', { name: /Borderline RGB/ });
      expect(card.style.backgroundColor).toBe('rgb(117, 117, 117)');
      expect(card.style.color).toBe('rgb(255, 255, 255)');
      fireEvent.mouseEnter(card);
      expect(card).toHaveClass('hover:ring-1', 'hover:ring-current');
      const wholeCardDimming = card.className.split(/\s+/).filter((token) => {
        const variants = token.split(':');
        return (
          !variants.includes('after') &&
          /^(?:brightness|opacity)-/.test(variants.at(-1) ?? '')
        );
      });
      expect(wholeCardDimming).toEqual([]);
      expect(card.style.opacity).toBe('');
      expect(card).toHaveClass(
        'focus-visible:outline-2',
        'focus-visible:outline-ring'
      );
      if (past) {
        expect(card).toHaveClass(
          'after:bg-background/50',
          'after:pointer-events-none',
          'hover:after:opacity-0',
          'focus-visible:after:opacity-0'
        );
      } else {
        expect(card).not.toHaveClass('after:bg-background/50');
      }
      expect(card.style.filter).toBe('');
      expect(card.style.backgroundColor).toBe('rgb(117, 117, 117)');
      expect(card.style.color).toBe('rgb(255, 255, 255)');
      const luminance = ((117 / 255 + 0.055) / 1.055) ** 2.4;
      expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
      fireEvent.click(card);
      expect(state.openModal).toHaveBeenCalledWith('borderline-rgb');
    }
  );

  it.each([false, true])(
    'uses provider RGB in month and agenda, inherited=%s',
    (inherited) => {
      state.events = [
        {
          id: 'rgb',
          title: 'RGB event',
          color: 'BLUE',
          start_at: new Date(2026, 8, 7, 10).toISOString(),
          end_at: new Date(2026, 8, 7, 11).toISOString(),
          _calendarColor: '#ff80ab',
          scheduling_metadata: {
            google_color: { version: 1, inherited, background: '#00ff88' },
          },
        },
      ];
      const rgb = inherited ? 'rgb(255, 128, 171)' : 'rgb(0, 255, 136)';
      const month = render(
        <MonthCalendar date={date} viewedMonth={date} locale="en" />
      );
      expect(
        screen.getByRole('button', { name: /RGB event/ }).style.backgroundColor
      ).toBe(rgb);
      expect(
        screen.getByRole('button', { name: /RGB event/ }).style.color
      ).toBe('rgb(0, 0, 0)');
      month.unmount();
      render(<AgendaView startDate={date} locale="en" daysToShow={1} />);
      expect(
        screen.getByRole('button', { name: /RGB event/ }).style.backgroundColor
      ).toBe(rgb);
      expect(
        screen.getByRole('button', { name: /RGB event/ }).style.color
      ).toBe('rgb(0, 0, 0)');
    }
  );
});
