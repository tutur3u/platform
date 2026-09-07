import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { CalendarView } from '../../../../hooks/use-view-transition';
import { calendarDraftDate, calendarPeriodDates } from './calendar-period';
import {
  calendarShortcutView,
  useCalendarViewShortcuts,
} from './use-calendar-view-shortcuts';

function ControlledViews({ disabledWeek = false }: { disabledWeek?: boolean }) {
  const [view, setView] = useState<CalendarView>('week');
  useCalendarViewShortcuts({
    enabled: true,
    availableViews: disabledWeek
      ? [
          { value: 'week', disabled: true },
          { value: '4-days', disabled: true },
          { value: 'month' },
        ]
      : undefined,
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
    { shiftKey: true },
    { isComposing: true },
    { repeat: true },
  ])('ignores competing commands %j', (options) => {
    expect(
      calendarShortcutView(
        new KeyboardEvent('keydown', { key: 'm', ...options })
      )
    ).toBeNull();
  });
  it('does not invoke views disabled for the current screen', () => {
    render(<ControlledViews disabledWeek />);
    fireEvent.keyDown(window, { key: 'm' });
    fireEvent.keyDown(window, { key: 'w' });
    fireEvent.keyDown(window, { key: '4' });
    expect(screen.getByText('month')).toBeVisible();
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
  it('creates 9 AM drafts in the selected zone without caller plugin setup', () => {
    expect(
      calendarDraftDate(new Date(2026, 8, 7), 'Asia/Ho_Chi_Minh').toISOString()
    ).toBe('2026-09-07T02:00:00.000Z');
  });
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
