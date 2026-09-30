import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  zone: 'America/New_York',
  showWeekends: false,
}));
vi.mock('./settings/settings-context', () => ({
  useCalendarSettings: () => ({
    settings: {
      timezone: { timezone: state.zone },
      appearance: { showWeekends: state.showWeekends },
    },
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserBooleanConfig: () => ({ value: false }),
}));
vi.mock('./all-day-event-bar', () => ({ AllDayEventBar: () => null }));
vi.mock('./time-indicator-line', () => ({
  TimeIndicatorLine: ({ columnIndex }: { columnIndex: number }) => (
    <div data-testid="indicator">{columnIndex}</div>
  ),
}));

import { DayTitle } from './day-title';
import { TimeIndicator } from './time-indicator';
import { WeekdayBar } from './weekday-bar';

afterEach(() => vi.useRealTimers());
describe('calendar day display', () => {
  it('keeps Monday carrier headings and weekday filtering in a zone behind the browser', () => {
    state.zone = 'America/New_York';
    render(
      <WeekdayBar
        locale="en"
        view="week"
        dates={[
          new Date(2026, 8, 6),
          new Date(2026, 8, 7),
          new Date(2026, 8, 8),
        ]}
      />
    );
    expect(screen.queryByText('Sun')).toBeNull();
    expect(screen.getByText('Mon')).toBeVisible();
    expect(screen.getByText('7')).toBeVisible();
    expect(screen.getByText('Tue')).toBeVisible();
  });
  it.each([
    ['America/New_York', '2026-09-08T01:00:00Z', 7, 0],
    ['Asia/Tokyo', '2026-09-07T23:00:00Z', 8, 1],
  ])(
    'aligns the heading and indicator Today for %s',
    (zone, now, day, column) => {
      state.zone = zone;
      vi.useFakeTimers();
      vi.setSystemTime(new Date(now));
      render(
        <>
          <DayTitle
            view="day"
            date={new Date(2026, 8, day)}
            weekday="Heading"
          />
          <TimeIndicator dates={[new Date(2026, 8, 7), new Date(2026, 8, 8)]} />
        </>
      );
      expect(screen.getByText(String(day))).toHaveClass('bg-primary');
      expect(screen.getByTestId('indicator')).toHaveTextContent(String(column));
    }
  );
  it('advances Today and the indicator at calendar midnight while preserving view days', () => {
    state.zone = 'America/New_York';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T03:59:30Z'));
    const dates = [new Date(2026, 8, 7), new Date(2026, 8, 8)];
    const { unmount } = render(
      <>
        {dates.map((date) => (
          <DayTitle
            key={date.getDate()}
            view="day"
            date={date}
            weekday="Heading"
          />
        ))}
        <TimeIndicator dates={dates} />
      </>
    );
    expect(screen.getByText('7')).toHaveClass('bg-primary');
    expect(screen.getByTestId('indicator')).toHaveTextContent('0');
    // Every heading and indicator subscribes to a single shared clock timer.
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText('7')).not.toHaveClass('bg-primary');
    expect(screen.getByText('8')).toHaveClass('bg-primary');
    expect(screen.getByTestId('indicator')).toHaveTextContent('1');
    expect(dates.map((date) => [date.getDate(), date.getHours()])).toEqual([
      [7, 0],
      [8, 0],
    ]);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
