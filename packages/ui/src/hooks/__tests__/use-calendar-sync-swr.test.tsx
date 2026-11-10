import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarSyncProvider, useCalendarSync } from '../use-calendar-sync';

vi.mock('../../components/ui/sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn() },
}));

const event = (
  id: string,
  start: string,
  end: string,
  overrides: Partial<CalendarEvent> = {}
): CalendarEvent => ({
  id,
  title: id,
  description: '',
  start_at: start,
  end_at: end,
  color: 'BLUE',
  ws_id: 'workspace-1',
  ...overrides,
});

const week = (startDay: number, month = 5) =>
  Array.from({ length: 7 }, (_, i) => new Date(2026, month, startDay + i));

type Respond = (start: string) => Promise<CalendarEvent[]> | CalendarEvent[];

function stubFetch(respond: Respond) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/calendars'))
      return {
        ok: true,
        json: async () => ({ calendars: [], grouped: {}, total: 0 }),
      } as Response;
    if (url.pathname.includes('/calendar/habit-events'))
      return {
        ok: true,
        json: async () => ({ completedHabitEventIds: [], habitEventIds: [] }),
      } as Response;
    if (url.pathname.includes('/calendar/events')) {
      const data = await respond(url.searchParams.get('start_at') ?? '');
      return {
        ok: true,
        json: async () => ({ count: data.length, data }),
      } as Response;
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const eventStarts = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.endsWith('/calendar/events'))
    .map((url) => url.searchParams.get('start_at'));

function mountWith(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <CalendarSyncProvider wsId="workspace-1">{children}</CalendarSyncProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useCalendarSync(), { wrapper });
}

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const weekOne = event(
  'week-one',
  '2026-06-23T09:00:00Z',
  '2026-06-23T10:00:00Z'
);
const spanning = event(
  'spanning',
  '2026-06-26T09:00:00Z',
  '2026-07-15T10:00:00Z'
);

function openWeek(
  result: { current: ReturnType<typeof useCalendarSync> },
  dates: Date[]
) {
  act(() => {
    result.current.setTimezone('UTC');
    result.current.setDates(dates);
  });
}

describe('stale-while-revalidate calendar range cache', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('prefetches the previous and next week once the visible week is known', async () => {
    const fetchMock = stubFetch(() => []);
    const { result } = mountWith(newClient());
    openWeek(result, week(22));
    await waitFor(() => {
      const starts = eventStarts(fetchMock);
      expect(starts).toContain('2026-06-15T00:00:00.000Z');
      expect(starts).toContain('2026-06-22T00:00:00.000Z');
      expect(starts).toContain('2026-06-29T00:00:00.000Z');
    });
  });

  it('serves a prefetched next week without a skeleton or a second request', async () => {
    const nextWeek = event(
      'next-week',
      '2026-06-30T09:00:00Z',
      '2026-06-30T10:00:00Z'
    );
    const fetchMock = stubFetch((start) =>
      start.startsWith('2026-06-29') ? [nextWeek] : [weekOne]
    );
    const { result } = mountWith(newClient());
    openWeek(result, week(22));
    await waitFor(() =>
      expect(eventStarts(fetchMock)).toContain('2026-06-29T00:00:00.000Z')
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const before = eventStarts(fetchMock).filter((s) =>
      s?.startsWith('2026-06-29')
    ).length;
    act(() => result.current.setDates(week(29)));
    expect(result.current.isLoading).toBe(false);
    await waitFor(() =>
      expect(result.current.events.map((e) => e.id)).toEqual(['next-week'])
    );
    expect(
      eventStarts(fetchMock).filter((s) => s?.startsWith('2026-06-29')).length
    ).toBe(before);
  });

  it('keeps the previous week rows and shows no skeleton while an unseen range loads', async () => {
    let release: (() => void) | undefined;
    const fetchMock = stubFetch((start) => {
      if (start.startsWith('2026-07-13'))
        return new Promise<CalendarEvent[]>((resolve) => {
          release = () => resolve([]);
        });
      return [weekOne, spanning];
    });
    const { result } = mountWith(newClient());
    openWeek(result, week(22));
    await waitFor(() => expect(result.current.data?.length).toBe(2));
    expect(result.current.isPlaceholderData).toBe(false);

    act(() => result.current.setDates(week(13, 6)));
    await waitFor(() =>
      expect(eventStarts(fetchMock)).toContain('2026-07-13T00:00:00.000Z')
    );

    // Previous range rows stay, the skeleton gate stays off, and only rows that
    // overlap the visible range are listed.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.map((e) => e.id)).toEqual([
      'week-one',
      'spanning',
    ]);
    expect(result.current.events.map((e) => e.id)).toEqual(['spanning']);

    await act(async () => release?.());
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.events).toEqual([]);
  });

  it('raises the skeleton flag only for a range that has no events at all', async () => {
    const releases: Array<() => void> = [];
    stubFetch(
      () =>
        new Promise<CalendarEvent[]>((resolve) => {
          releases.push(() => resolve([weekOne]));
        })
    );
    const { result } = mountWith(newClient());
    openWeek(result, week(22));
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.data).toBeNull();

    await act(async () => releases.splice(0).forEach((release) => release()));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Revalidation of a range that already has data never shows the skeleton.
    act(() => result.current.refresh());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.events.map((e) => e.id)).toEqual(['week-one']);

    // Neither does moving to a range that is still loading.
    act(() => result.current.setDates(week(13, 6)));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPlaceholderData).toBe(true);
  });

  it('returns cached rows synchronously on remount and revalidates once stale', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 24, 12));
    const fetchMock = stubFetch(() => [weekOne]);
    const client = newClient();
    const first = mountWith(client);
    openWeek(first.result, week(22));
    await waitFor(() => expect(first.result.current.events).toHaveLength(1));
    first.unmount();
    const calls = () =>
      eventStarts(fetchMock).filter((s) => s?.startsWith('2026-06-22')).length;
    expect(calls()).toBe(1);

    // The range holding today goes stale after 30 seconds.
    vi.setSystemTime(new Date(2026, 5, 24, 12, 0, 45));
    let release: (() => void) | undefined;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (!url.pathname.includes('/calendar/events'))
        return {
          ok: true,
          json: async () => ({
            calendars: [],
            completedHabitEventIds: [],
            habitEventIds: [],
          }),
        } as Response;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        ok: true,
        json: async () => ({ count: 1, data: [weekOne] }),
      } as Response;
    });

    const second = mountWith(client);
    openWeek(second.result, week(22));
    // Cached rows are present right after the commit, before any request settles.
    expect(second.result.current.events.map((e) => e.id)).toEqual(['week-one']);
    expect(second.result.current.isLoading).toBe(false);
    await waitFor(() => expect(calls()).toBe(2));
    await act(async () => release?.());
  });
});
