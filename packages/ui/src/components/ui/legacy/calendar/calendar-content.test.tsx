import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarView } from '../../../../hooks/use-view-transition';

const mocks = vi.hoisted(() => ({
  setDates: vi.fn(),
  transition: (_view: string, action: () => void) => action(),
  dates: [new Date(2026, 8, 7)],
  settings: { appearance: { firstDayOfWeek: 'monday' } },
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar-sync', () => ({
  useCalendarSync: () => ({
    dates: mocks.dates,
    setDates: mocks.setDates,
    isLoading: false,
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-view-transition', () => ({
  useViewTransition: () => ({ transition: mocks.transition }),
}));
vi.mock('./settings/settings-context', () => ({
  useCalendarSettings: () => ({ settings: mocks.settings }),
}));
vi.mock('./calendar-header', () => ({
  CalendarHeader: ({
    view,
    onViewChange,
  }: {
    view: string;
    onViewChange: (view: string) => void;
  }) => (
    <button type="button" onClick={() => onViewChange('month')}>
      Header {view}
    </button>
  ),
}));
vi.mock('./agenda-view', () => ({ AgendaView: () => <div>Agenda</div> }));
vi.mock('./calendar-loading-skeleton', () => ({
  CalendarLoadingSkeleton: () => null,
}));
vi.mock('./calendar-view-with-trail', () => ({
  CalendarViewWithTrail: () => null,
}));
vi.mock('./event-modal', () => ({ EventModal: () => null }));
vi.mock('./event-preview-popover', () => ({ EventPreviewPopover: () => null }));
vi.mock('./weekday-bar', () => ({ WeekdayBar: () => null }));
vi.mock('./month-calendar', () => ({
  MonthCalendar: ({ onDayClick }: { onDayClick: (date: Date) => void }) => (
    <button type="button" onClick={() => onDayClick(new Date(2026, 8, 22))}>
      Open September 22
    </button>
  ),
}));
vi.mock('./year-calendar', () => ({
  YearCalendar: ({ onMonthClick }: { onMonthClick: (date: Date) => void }) => (
    <button type="button" onClick={() => onMonthClick(new Date(2026, 10, 1))}>
      Open November
    </button>
  ),
}));

import { CalendarContent } from './calendar-content';

const translate = (key: string) => key;
function ControlledCalendar({
  initialView = 'week',
}: {
  initialView?: CalendarView;
}) {
  const [view, setView] = useState(initialView);
  const [date, setDate] = useState(new Date(2026, 8, 7));
  return (
    <>
      <output>
        {view}:{date.getMonth() + 1}:{date.getDate()}
      </output>
      <CalendarContent
        t={translate}
        locale="en"
        externalState={{ view, setView, date, setDate, availableViews: [] }}
      />
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  mocks.setDates.mockClear();
});
describe('satellite controlled calendar views', () => {
  it('M updates the parent state, persists the month, and supports day drill-down', () => {
    render(<ControlledCalendar />);
    fireEvent.keyDown(window, { key: 'm' });
    expect(screen.getByText('month:9:1')).toBeVisible();
    expect(localStorage.getItem('calendar-view-mode')).toBe('month');
    fireEvent.click(screen.getByText('Open September 22'));
    expect(screen.getByText('day:9:22')).toBeVisible();
  });
  it('the menu enters month and an uncontrolled calendar restores the saved month', () => {
    const mounted = render(<ControlledCalendar />);
    fireEvent.click(screen.getByText('Header week'));
    expect(screen.getByText('month:9:1')).toBeVisible();
    mounted.unmount();
    render(<CalendarContent t={translate} locale="en" />);
    expect(screen.getByText('Header month')).toBeVisible();
  });
  it('year drill-down opens the chosen month', () => {
    render(<ControlledCalendar initialView="year" />);
    fireEvent.click(screen.getByText('Open November'));
    expect(screen.getByText('month:11:1')).toBeVisible();
    const dates = mocks.setDates.mock.calls.at(-1)?.[0] as Date[];
    expect(
      dates.some((date) => date.getMonth() === 10 && date.getDate() === 30)
    ).toBe(true);
  });
});
