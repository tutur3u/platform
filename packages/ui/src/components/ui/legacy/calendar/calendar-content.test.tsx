import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarView } from '../../../../hooks/use-view-transition';

const mocks = vi.hoisted(() => ({
  setDates: vi.fn(),
  transition: (_view: string, action: () => void) => action(),
  dates: [new Date(2026, 8, 7)],
  settings: {
    appearance: { firstDayOfWeek: 'monday', timeFormat: '24h' },
    timezone: { timezone: 'Asia/Ho_Chi_Minh' },
  },
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
vi.mock('./event-modal', async () => {
  const { EventDateTimePicker } = await import('./event-form-components.js');
  const { createAllDayEvent } = await import('@tuturuuu/utils/calendar-utils');
  return {
    EventModal: () => {
      const [date, setDate] = useState(new Date('2026-09-30T11:00:00Z'));
      const [allDay, setAllDay] = useState(false);
      return (
        <>
          <EventDateTimePicker
            label="Start"
            value={date}
            onChange={(next) => next && setDate(next)}
            showTimeSelect={!allDay}
          />
          <button
            type="button"
            onClick={() => {
              const range = createAllDayEvent(
                new Date('2026-10-05T07:15:00Z'),
                'Asia/Ho_Chi_Minh'
              );
              setDate(new Date(range.start_at));
              setAllDay(true);
            }}
          >
            Select October 5 all day
          </button>
          <output aria-label="Stored instant">{date.toISOString()}</output>
        </>
      );
    },
  };
});
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
  const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(
    function (this: Intl.DateTimeFormat) {
      return { ...resolvedOptions.call(this), timeZone: 'America/Los_Angeles' };
    }
  );
});
afterEach(() => vi.restoreAllMocks());
describe('satellite controlled calendar views', () => {
  it('uses the calendar timezone for event display and serializes edits as UTC', async () => {
    render(
      <CalendarContent
        t={translate}
        locale="en"
        workspace={{ id: 'workspace-1' } as never}
      />
    );
    fireEvent.click(screen.getByText('18:00'));
    expect(await screen.findByText('Asia/Ho Chi Minh')).toBeVisible();
    fireEvent.click(screen.getByTitle('Enter time manually'));
    const input = screen.getByRole('textbox', {
      name: 'Enter time manually in HH:MM',
    });
    fireEvent.change(input, { target: { value: '14:30' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByLabelText('Stored instant')).toHaveTextContent(
      '2026-09-30T07:30:00.000Z'
    );
  });
  it('displays the configured all-day date rather than the browser previous day', () => {
    render(
      <CalendarContent
        t={translate}
        locale="en"
        workspace={{ id: 'workspace-1' } as never}
      />
    );
    fireEvent.click(screen.getByText('Select October 5 all day'));
    expect(
      screen.getByRole('button', { name: 'Selected Oct 5, 2026 00:00' })
    ).toBeVisible();
    expect(screen.getByLabelText('Stored instant')).toHaveTextContent(
      '2026-10-04T17:00:00.000Z'
    );
  });
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
