import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { useCalendarDayZone } from '@tuturuuu/ui/hooks/use-calendar-day-zone';
import { calendarDayKey } from '@tuturuuu/ui/lib/calendar-day';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarPage from '../app/[locale]/(dashboard)/[wsId]/page';
import {
  CalendarNavigationProvider,
  useCalendarNavigation,
} from './calendar-navigation-provider';
import { CalendarWorkspacePage } from './calendar-workspace-page';

const state = vi.hoisted(() => ({
  zone: 'America/Los_Angeles',
  maybeSingle: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: async () => ({ id: 'synthetic-user' }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: async () => ({ id: 'workspace', personal: false }),
  getPermissions: async () => ({ withoutPermission: () => false }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: state.from.mockImplementation(() => {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: state.eq.mockReturnThis(),
        maybeSingle: state.maybeSingle,
      };
      return query;
    }),
  }),
}));
vi.mock('@tuturuuu/utils/calendar-auth-token', () => ({
  fetchUserWorkspaceCalendarGoogleTokenForClient: async () => null,
}));
vi.mock(
  '@tuturuuu/tasks-ui/calendar/components/load-smart-scheduling-tasks',
  () => ({
    loadSmartSchedulingTasks: async () => [],
  })
);
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('next/navigation', () => ({
  redirect: (value: string) => {
    throw new Error(`Unexpected redirect ${value}`);
  },
  notFound: () => {
    throw new Error('Unexpected notFound');
  },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@tuturuuu/tasks-ui/calendar/task-calendar-page-shell', () => ({
  TaskCalendarPageShell: () => null,
}));

function SelectedDay() {
  const navigation = useCalendarNavigation();
  const bridge = useCalendarDayZone();
  useEffect(() => bridge?.setTimezone(state.zone), [bridge?.setTimezone]);
  return (
    <output data-testid="route-selected-day">
      {calendarDayKey(navigation.date)}
    </output>
  );
}
async function serverPage(date?: string | string[], eventId?: string) {
  return CalendarPage({
    params: Promise.resolve({ wsId: 'workspace', locale: 'en' }),
    searchParams: Promise.resolve({ date, eventId }),
  });
}
async function renderRoute(
  date: string | undefined,
  browser: string,
  zone: string,
  eventId?: string
) {
  vi.stubEnv('TZ', browser);
  state.zone = zone;
  const element = await serverPage(date, eventId);
  expect(element.type).toBe(CalendarWorkspacePage);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CalendarNavigationProvider>
        <SelectedDay />
        {element}
      </CalendarNavigationProvider>
    </QueryClientProvider>
  );
  return element;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.maybeSingle.mockResolvedValue({
    data: { start_at: '2026-01-01T01:00:00Z' },
    error: null,
  });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe('actual Calendar route to client navigation', () => {
  it.each([
    ['Asia/Tokyo', 'America/Los_Angeles'],
    ['America/Los_Angeles', 'Asia/Tokyo'],
  ])(
    'preserves date-only January 1 from server through client for browser %s / calendar %s',
    async (browser, zone) => {
      const element = await renderRoute('2026-01-01', browser, zone);
      expect(element.props.initialDate).toBe('2026-01-01');
      expect(screen.getByTestId('route-selected-day').textContent).toBe(
        '2026-01-01'
      );
    }
  );
  it.each([
    ['2026-01-01T01:00:00Z', 'Asia/Tokyo', 'America/Los_Angeles', '2025-12-31'],
    ['2025-12-31T16:00:00Z', 'America/Los_Angeles', 'Asia/Tokyo', '2026-01-01'],
  ])(
    'projects timestamp %s through the actual client',
    async (date, browser, zone, expected) => {
      const element = await renderRoute(date, browser, zone);
      expect(element.props.initialDate).toBe(new Date(date).toISOString());
      expect(screen.getByTestId('route-selected-day').textContent).toBe(
        expected
      );
    }
  );
  it.each([
    ['2026-02-30', undefined],
    ['2023-02-29', undefined],
    ['1900-02-29', undefined],
    ['2024-02-29', '2024-02-29'],
    ['2000-02-29', '2000-02-29'],
  ])(
    'validates Gregorian day %s before passing client props',
    async (date, expected) => {
      expect((await serverPage(date)).props.initialDate).toBe(expected);
    }
  );
  it('keeps eventId fallback as a workspace-scoped instant after an invalid date-only link', async () => {
    const element = await renderRoute(
      '2026-02-30',
      'Asia/Tokyo',
      'America/Los_Angeles',
      'synthetic-event'
    );
    expect(element.props.initialDate).toBe('2026-01-01T01:00:00.000Z');
    expect(screen.getByTestId('route-selected-day').textContent).toBe(
      '2025-12-31'
    );
    expect(state.from).toHaveBeenCalledWith('workspace_calendar_events');
    expect(state.eq).toHaveBeenCalledWith('id', 'synthetic-event');
    expect(state.eq).toHaveBeenCalledWith('ws_id', 'workspace');
  });
  it('validates timestamp input and retains its offset-defined instant', async () => {
    expect(
      (await serverPage('2026-01-01T09:00:00+09:00')).props.initialDate
    ).toBe('2026-01-01T00:00:00.000Z');
    expect(
      (await serverPage('invalid-timestamp')).props.initialDate
    ).toBeUndefined();
  });
});
