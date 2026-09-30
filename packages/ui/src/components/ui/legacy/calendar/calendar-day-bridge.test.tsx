import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CalendarDayZoneBridgeProvider } from '../../../../hooks/use-calendar-day-zone';
import { calendarDayKey } from '../../../../lib/calendar-day';

const state = vi.hoisted(() => ({
  zone: 'Asia/Tokyo',
  setTimezone: vi.fn(),
  setDates: vi.fn(),
  outerZone: vi.fn(),
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar-sync', () => ({
  useCalendarSync: () => ({
    dates: [new Date(2026, 0, 1)],
    isLoading: false,
    setDates: state.setDates,
    setTimezone: state.setTimezone,
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-view-transition', () => ({
  useViewTransition: () => ({
    transition: (_: string, action: () => void) => action(),
  }),
}));
vi.mock('./settings/settings-context', () => ({
  useCalendarSettings: () => ({
    settings: {
      timezone: { timezone: state.zone },
      appearance: { firstDayOfWeek: 'monday' },
    },
  }),
}));
vi.mock('./calendar-header', () => ({
  CalendarHeader: ({ date }: { date: Date }) => (
    <output data-testid="day">
      {calendarDayKey(date)}:{date.getHours()}
    </output>
  ),
}));
vi.mock('./agenda-view', () => ({ AgendaView: () => null }));
vi.mock('./calendar-loading-skeleton', () => ({
  CalendarLoadingSkeleton: () => null,
}));
vi.mock('./calendar-view-with-trail', () => ({
  CalendarViewWithTrail: () => null,
}));
vi.mock('./event-modal', () => ({ EventModal: () => null }));
vi.mock('./event-preview-popover', () => ({ EventPreviewPopover: () => null }));
vi.mock('./weekday-bar', () => ({ WeekdayBar: () => null }));
vi.mock('./month-calendar', () => ({ MonthCalendar: () => null }));
vi.mock('./year-calendar', () => ({ YearCalendar: () => null }));

import { CalendarContent } from './calendar-content';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});
it('shared content projects default Today, bridges the settings zone and keeps selection through midnight', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-12-31T16:00:00Z'));
  state.zone = 'Asia/Tokyo';
  const { rerender } = render(
    <CalendarContent t={(key: string) => key} locale="en" />
  );
  expect(screen.getByTestId('day')).toHaveTextContent('2026-01-01:0');
  expect(state.setTimezone).toHaveBeenLastCalledWith('Asia/Tokyo');
  act(() => vi.advanceTimersByTime(24 * 60 * 60_000));
  expect(screen.getByTestId('day')).toHaveTextContent('2026-01-01:0');
  state.zone = 'America/New_York';
  rerender(<CalendarContent t={(key: string) => key} locale="en" />);
  expect(state.setTimezone).toHaveBeenLastCalledWith('America/New_York');
});
it('content forwards the zone to outer host navigation without reprojecting an explicit date', () => {
  state.zone = 'Asia/Tokyo';
  render(
    <CalendarDayZoneBridgeProvider value={{ setTimezone: state.outerZone }}>
      <CalendarContent
        t={(key: string) => key}
        locale="en"
        externalState={{
          date: new Date(2026, 0, 10),
          setDate: vi.fn(),
          view: 'day',
          setView: vi.fn(),
          availableViews: [],
        }}
      />
    </CalendarDayZoneBridgeProvider>
  );
  expect(state.outerZone).toHaveBeenCalledWith('Asia/Tokyo');
  expect(screen.getByTestId('day')).toHaveTextContent('2026-01-10');
});
