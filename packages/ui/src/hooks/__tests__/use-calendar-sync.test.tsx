import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarSyncProvider, useCalendarSync } from '../use-calendar-sync';

vi.mock('../../components/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const createEvent = (
  id: string,
  overrides: Partial<CalendarEvent> = {}
): CalendarEvent => ({
  id,
  title: 'Planning',
  description: '',
  start_at: '2026-06-22T09:00:00.000Z',
  end_at: '2026-06-22T10:00:00.000Z',
  color: 'BLUE',
  ws_id: 'workspace-1',
  ...overrides,
});

function renderCalendarSync({
  externalEvents,
}: {
  externalEvents?: CalendarEvent[];
} = {}) {
  const queryClient = createQueryClient();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CalendarSyncProvider externalEvents={externalEvents} wsId="workspace-1">
        {children}
      </CalendarSyncProvider>
    </QueryClientProvider>
  );

  return renderHook(() => useCalendarSync(), { wrapper });
}

function mockCalendarFetch(events: CalendarEvent[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('/calendar/habit-events')) {
      return {
        ok: true,
        json: async () => ({
          completedHabitEventIds: [],
          habitEventIds: [],
        }),
      } as Response;
    }

    if (url.includes('/calendar/events')) {
      return {
        ok: true,
        json: async () => ({
          count: events.length,
          data: events,
        }),
      } as Response;
    }

    throw new Error(`Unexpected fetch ${url}`);
  });
}

function createWeekDates(startIsoDate: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${startIsoDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date;
  });
}

function mockCalendarFetchByWeek(
  eventsByWeekStart: Record<string, CalendarEvent[]>
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');

    if (url.pathname.includes('/calendar/habit-events')) {
      return {
        ok: true,
        json: async () => ({
          completedHabitEventIds: [],
          habitEventIds: [],
        }),
      } as Response;
    }

    if (url.pathname.includes('/calendar/events')) {
      const startAt = url.searchParams.get('start_at');
      const startAtTime = startAt ? new Date(startAt).getTime() : NaN;
      const matchingEvents = Object.entries(eventsByWeekStart).find(
        ([weekStart]) => {
          const expectedStart = new Date(
            `${weekStart}T00:00:00.000Z`
          ).getTime();

          return Math.abs(startAtTime - expectedStart) < 24 * 60 * 60 * 1000;
        }
      )?.[1];

      return {
        ok: true,
        json: async () => ({
          count: matchingEvents?.length ?? 0,
          data: matchingEvents ?? [],
        }),
      } as Response;
    }

    throw new Error(`Unexpected fetch ${url}`);
  });
}

describe('CalendarSyncProvider optimistic visible events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('keeps last successful events visible while a refetch is pending', async () => {
    const initialEvent = createEvent('event-1');
    let databaseCalls = 0;
    let resolveRefetch:
      | ((response: Pick<Response, 'json' | 'ok'>) => void)
      | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/calendar/habit-events')) {
        return {
          ok: true,
          json: async () => ({
            completedHabitEventIds: [],
            habitEventIds: [],
          }),
        } as Response;
      }

      if (url.includes('/calendar/events')) {
        databaseCalls += 1;

        if (databaseCalls === 1) {
          return {
            ok: true,
            json: async () => ({
              count: 1,
              data: [initialEvent],
            }),
          } as Response;
        }

        return new Promise((resolve) => {
          resolveRefetch = resolve;
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderCalendarSync();

    act(() => {
      result.current.setDates([new Date('2026-06-22T00:00:00.000Z')]);
    });

    await waitFor(() => {
      expect(result.current.events.map((event) => event.id)).toEqual([
        'event-1',
      ]);
    });

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(databaseCalls).toBe(2);
    });
    expect(result.current.events.map((event) => event.id)).toEqual(['event-1']);

    act(() => {
      resolveRefetch?.({
        ok: true,
        json: async () => ({
          count: 1,
          data: [initialEvent],
        }),
      });
    });
  });

  it('keeps last successful events visible and exposes error state on fetch failure', async () => {
    const initialEvent = createEvent('event-1');
    const fetchMock = mockCalendarFetch([initialEvent]);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderCalendarSync();

    act(() => {
      result.current.setDates([new Date('2026-06-22T00:00:00.000Z')]);
    });

    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/calendar/habit-events')) {
        return {
          ok: true,
          json: async () => ({
            completedHabitEventIds: [],
            habitEventIds: [],
          }),
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({ error: 'Nope' }),
      } as Response;
    });

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.syncStatus.state).toBe('error');
    });
    expect(result.current.events.map((event) => event.id)).toEqual(['event-1']);
  });

  it('shows the active week events when navigating away and back', async () => {
    const currentWeekEvent = createEvent('current-week-event', {
      start_at: '2026-06-22T09:00:00.000Z',
      end_at: '2026-06-22T10:00:00.000Z',
    });
    const nextWeekEvent = createEvent('next-week-event', {
      start_at: '2026-06-29T09:00:00.000Z',
      end_at: '2026-06-29T10:00:00.000Z',
    });
    const fetchMock = mockCalendarFetchByWeek({
      '2026-06-22': [currentWeekEvent],
      '2026-06-29': [nextWeekEvent],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderCalendarSync();

    act(() => {
      result.current.setDates(createWeekDates('2026-06-22'));
    });

    await waitFor(() => {
      expect(result.current.events.map((event) => event.id)).toEqual([
        'current-week-event',
      ]);
    });

    act(() => {
      result.current.setDates(createWeekDates('2026-06-29'));
    });

    await waitFor(() => {
      expect(result.current.events.map((event) => event.id)).toEqual([
        'next-week-event',
      ]);
    });

    act(() => {
      result.current.setDates(createWeekDates('2026-06-22'));
    });

    await waitFor(() => {
      expect(result.current.events.map((event) => event.id)).toEqual([
        'current-week-event',
      ]);
    });

    act(() => {
      result.current.setDates(createWeekDates('2026-06-29'));
    });

    await waitFor(() => {
      expect(result.current.events.map((event) => event.id)).toEqual([
        'next-week-event',
      ]);
    });
  });

  it('applies optimistic insert, update, and delete deltas immediately', async () => {
    const baseEvent = createEvent('event-1');
    const { result } = renderCalendarSync({ externalEvents: [baseEvent] });

    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });

    act(() => {
      result.current.patchVisibleEvents(
        [
          createEvent('optimistic-1', {
            title: 'Draft',
          }),
        ],
        { status: 'creating' }
      );
    });

    expect(result.current.events.map((event) => event.id)).toContain(
      'optimistic-1'
    );
    expect(
      result.current.events.find((event) => event.id === 'optimistic-1')
        ?._optimisticStatus
    ).toBe('creating');

    act(() => {
      result.current.patchVisibleEvents(
        [
          {
            ...baseEvent,
            title: 'Moved',
          },
        ],
        { status: 'updating' }
      );
    });

    expect(
      result.current.events.find((event) => event.id === 'event-1')
    ).toMatchObject({
      _optimisticStatus: 'updating',
      title: 'Moved',
    });

    act(() => {
      result.current.patchVisibleEvents([], { removeIds: ['event-1'] });
    });

    expect(result.current.events.some((event) => event.id === 'event-1')).toBe(
      false
    );

    act(() => {
      result.current.patchVisibleEvents([baseEvent]);
    });

    expect(
      result.current.events.find((event) => event.id === 'event-1')
    ).toMatchObject({
      title: 'Planning',
    });
  });

  it('reconciles optimistic updates with later server data', async () => {
    let externalEvents = [createEvent('event-1')];
    const queryClient = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <CalendarSyncProvider
          externalEvents={externalEvents}
          wsId="workspace-1"
        >
          {children}
        </CalendarSyncProvider>
      </QueryClientProvider>
    );
    const { rerender, result } = renderHook(() => useCalendarSync(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });

    act(() => {
      result.current.patchVisibleEvents([
        createEvent('event-1', { title: 'Server-confirmed' }),
      ]);
    });

    expect(
      result.current.events.find((event) => event.id === 'event-1')?.title
    ).toBe('Server-confirmed');

    externalEvents = [createEvent('event-1', { title: 'Server-confirmed' })];
    rerender();

    await waitFor(() => {
      expect(
        result.current.events.find((event) => event.id === 'event-1')
          ?._optimisticStatus
      ).toBeUndefined();
      expect(
        result.current.events.find((event) => event.id === 'event-1')?.title
      ).toBe('Server-confirmed');
    });
  });

  it('keeps identical title and time events as distinct IDs without deleting either', async () => {
    const duplicateA = createEvent('event-a');
    const duplicateB = createEvent('event-b');
    const fetchMock = mockCalendarFetch([duplicateA, duplicateB]);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderCalendarSync();

    act(() => {
      result.current.setDates([new Date('2026-06-22T00:00:00.000Z')]);
    });

    await waitFor(() => {
      expect(result.current.events.map((event) => event.id).sort()).toEqual([
        'event-a',
        'event-b',
      ]);
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/calendar/events/event-b'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
