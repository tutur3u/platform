// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useCalendarDayZone } from '@tuturuuu/ui/hooks/use-calendar-day-zone';
import { CalendarHeader } from '@tuturuuu/ui/legacy/calendar/calendar-header';
import {
  calendarDayKey,
  calendarNavigationDate,
} from '@tuturuuu/ui/lib/calendar-day';
import { type ReactNode, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CalendarNavigationProvider,
  useCalendarNavigation,
} from './calendar-navigation-provider';
import { CalendarWorkspacePage } from './calendar-workspace-page';
import { MiniMonthCalendar } from './mini-month-calendar';

const settings = vi.hoisted(() => ({ zone: 'Asia/Tokyo' }));
vi.mock('@tuturuuu/ui/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@tuturuuu/tasks-ui/calendar/task-calendar-page-shell', () => ({
  TaskCalendarPageShell: () => null,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserBooleanConfig: () => ({ value: false, toggle: vi.fn() }),
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar-sync', () => ({
  useCalendarSync: () => ({ syncStatus: { state: 'idle' } }),
}));
vi.mock('@tuturuuu/ui/legacy/calendar/settings/settings-context', () => ({
  useCalendarSettings: () => ({
    settings: { timezone: { timezone: settings.zone } },
  }),
}));
function Controls() {
  const state = useCalendarNavigation();
  const bridge = useCalendarDayZone();
  useEffect(() => bridge?.setTimezone(settings.zone), [bridge?.setTimezone]);
  return (
    <>
      <output data-testid="selected">{calendarDayKey(state.date)}</output>
      <button
        type="button"
        onClick={() => state.setDate(new Date(2026, 0, 10))}
      >
        Pick January 10
      </button>
      <button
        type="button"
        onClick={() => bridge?.setTimezone('America/New_York')}
      >
        Change zone
      </button>
      <CalendarHeader
        t={(key: string) => key}
        locale="en"
        date={state.date}
        setDate={state.setDate}
        view="day"
        offset={1}
        availableViews={[]}
        onViewChange={() => {}}
      />
    </>
  );
}
function renderCalendar(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe('actual Calendar navigation Today surfaces', () => {
  it.each(['America/Los_Angeles', 'Pacific/Auckland'])(
    'uses the calendar day in a browser %s across year midnight',
    (browser) => {
      vi.stubEnv('TZ', browser);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-12-31T16:00:00Z'));
      settings.zone = 'Asia/Tokyo';
      renderCalendar(
        <CalendarNavigationProvider>
          <Controls />
          <MiniMonthCalendar />
        </CalendarNavigationProvider>
      );
      expect(screen.getByTestId('selected').textContent).toBe('2026-01-01');
      expect(
        screen
          .getByRole('button', { name: 'Thursday, January 1st, 2026' })
          .getAttribute('aria-current')
      ).toBe('date');
      fireEvent.click(screen.getByText('Pick January 10'));
      fireEvent.click(screen.getByRole('button', { name: 'today' }));
      expect(screen.getByTestId('selected').textContent).toBe('2026-01-01');
      fireEvent.click(screen.getByText('Pick January 10'));
      fireEvent.click(screen.getByText('Change zone'));
      expect(screen.getByTestId('selected').textContent).toBe('2026-01-10');
    }
  );
  it('updates header and sidebar Today at midnight without moving the selection', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-12-31T14:59:00Z'));
    settings.zone = 'Asia/Tokyo';
    renderCalendar(
      <CalendarNavigationProvider>
        <Controls />
        <MiniMonthCalendar />
      </CalendarNavigationProvider>
    );
    fireEvent.click(screen.getByText('Pick January 10'));
    expect(screen.getByTestId('selected').textContent).toBe('2026-01-10');
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByTestId('selected').textContent).toBe('2026-01-10');
    expect(
      screen
        .getByRole('button', { name: 'Thursday, January 1st, 2026' })
        .getAttribute('aria-current')
    ).toBe('date');
    fireEvent.click(screen.getByRole('button', { name: 'today' }));
    expect(screen.getByTestId('selected').textContent).toBe('2026-01-01');
  });
  it('leaves Today to the toolbar: the mini-month only picks dates and pages months', () => {
    settings.zone = 'Asia/Tokyo';
    renderCalendar(
      <CalendarNavigationProvider>
        <MiniMonthCalendar />
      </CalendarNavigationProvider>
    );
    expect(screen.queryByRole('button', { name: 'today' })).toBeNull();
    expect(
      screen.getAllByRole('button', { name: /^(previous|next)_month$/ })
    ).toHaveLength(2);
  });
  // L4: at 05:25 on Sat 14 Nov in Ho Chi Minh City (2026-11-13T22:25Z, still
  // the 13th in UTC) the mini-month selection and both today markers agree.
  it.each([
    ['opened that morning', '2026-11-13T22:25:00Z'],
    ['open since the evening before', '2026-11-13T16:30:00Z'],
  ])(
    'selects Sat 14 Nov at 2026-11-13T22:25Z in Asia/Ho_Chi_Minh when %s',
    (_, openedAt) => {
      vi.stubEnv('TZ', 'UTC');
      vi.useFakeTimers();
      vi.setSystemTime(new Date(openedAt));
      settings.zone = 'Asia/Ho_Chi_Minh';
      renderCalendar(
        <CalendarNavigationProvider>
          <Controls />
          <MiniMonthCalendar />
        </CalendarNavigationProvider>
      );
      const target = new Date('2026-11-13T22:25:00Z').getTime();
      act(() => vi.advanceTimersByTime(target - Date.now()));

      expect(screen.getByTestId('selected').textContent).toBe('2026-11-14');
      const saturday = screen.getByRole('button', {
        name: 'Saturday, November 14th, 2026',
      });
      expect(saturday.getAttribute('aria-current')).toBe('date');
      expect(saturday.getAttribute('aria-pressed')).toBe('true');
      expect(
        screen
          .getByRole('button', { name: 'Friday, November 13th, 2026' })
          .getAttribute('aria-pressed')
      ).toBe('false');
    }
  );
  it('applies a deep link once without resetting a later selection on timezone changes', () => {
    settings.zone = 'Asia/Tokyo';
    renderCalendar(
      <CalendarNavigationProvider>
        <Controls />
        <CalendarWorkspacePage
          initialDate="2026-01-01"
          enableSmartScheduling={false}
          isPersonalWorkspace={false}
          locale="en"
          smartSchedulingTasks={[]}
          userId="user"
          workspace={{ id: 'workspace' } as never}
        />
      </CalendarNavigationProvider>
    );
    expect(screen.getByTestId('selected').textContent).toBe('2026-01-01');
    fireEvent.click(screen.getByText('Pick January 10'));
    fireEvent.click(screen.getByText('Change zone'));
    expect(screen.getByTestId('selected').textContent).toBe('2026-01-10');
  });
  it('distinguishes explicit date-only links from event instants', () => {
    expect(
      calendarDayKey(
        calendarNavigationDate('2026-01-01', 'America/Los_Angeles')!
      )
    ).toBe('2026-01-01');
    expect(
      calendarDayKey(
        calendarNavigationDate('2026-01-01T01:00:00Z', 'America/Los_Angeles')!
      )
    ).toBe('2025-12-31');
    expect(
      calendarDayKey(
        calendarNavigationDate('2025-12-31T16:00:00Z', 'Asia/Tokyo')!
      )
    ).toBe('2026-01-01');
    expect(calendarNavigationDate('2026-02-30', 'UTC')).toBeNull();
  });
});
