import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { CalendarView } from '../../../../hooks/use-view-transition';
import { calendarPeriodDates } from './calendar-period';
import {
  calendarShortcutView,
  useCalendarViewShortcuts,
} from './use-calendar-view-shortcuts';

function ControlledViews() {
  const [view, setView] = useState<CalendarView>('week');
  useCalendarViewShortcuts({
    enabled: true,
    day: () => setView('day'),
    '4-days': () => setView('4-days'),
    week: () => setView('week'),
    month: () => setView('month'),
    year: () => setView('year'),
    agenda: () => setView('agenda'),
  });
  return (
    <>
      <output>{view}</output>
      <input aria-label="Event title" />
    </>
  );
}
describe('calendar keyboard navigation', () => {
  it('switches views with M and preserves typing', () => {
    render(<ControlledViews />);
    fireEvent.keyDown(window, { key: 'M' });
    expect(screen.getByText('month')).toBeVisible();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'y' });
    expect(screen.getByText('month')).toBeVisible();
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByText('agenda')).toBeVisible();
  });
  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
    { repeat: true },
  ])('ignores competing commands %j', (options) => {
    expect(
      calendarShortcutView(
        new KeyboardEvent('keydown', { key: 'm', ...options })
      )
    ).toBeNull();
  });
  it('does not change views behind a modal', () => {
    render(
      <div role="dialog" data-state="open">
        Settings
      </div>
    );
    expect(
      calendarShortcutView(new KeyboardEvent('keydown', { key: 'm' }))
    ).toBeNull();
  });
});
describe('event ranges', () => {
  it('fetches the entire leap year', () => {
    const dates = calendarPeriodDates(new Date(2028, 8, 7), 'year');
    expect(
      dates.map((date) => [date.getFullYear(), date.getMonth(), date.getDate()])
    ).toEqual([
      [2028, 0, 1],
      [2028, 11, 31],
    ]);
  });
  it('fetches all 30 agenda days across a year boundary', () => {
    const dates = calendarPeriodDates(new Date(2026, 11, 20, 15), 'agenda');
    expect(
      dates.map((date) => [
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
      ])
    ).toEqual([
      [2026, 11, 20, 0],
      [2027, 0, 18, 0],
    ]);
  });
});
