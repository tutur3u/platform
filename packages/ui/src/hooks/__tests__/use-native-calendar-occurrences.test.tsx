import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  list: vi.fn(),
  actor: { actorId: 'actor', assertActive: vi.fn() },
}));
vi.mock('@tuturuuu/internal-api/calendar-series', () => ({
  listNativeCalendarOccurrences: mock.list,
}));
vi.mock('../use-workspace-visibility', () => ({
  useWorkspaceActor: () => mock.actor,
}));

import {
  EMPTY_NATIVE_OCCURRENCES,
  nativeOccurrencesKey,
  useNativeCalendarOccurrences,
  visibleNativeOccurrences,
} from '../use-native-calendar-occurrences';

const event: CalendarEvent = {
  id: 'event',
  seriesId: 'series',
  start_at: '2026-10-05T09:00:00Z',
  end_at: '2026-10-05T10:00:00Z',
};
const dates = [new Date(2026, 9, 5)];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
beforeEach(() => {
  mock.list.mockReset();
  mock.actor.actorId = 'actor';
  mock.actor.assertActive.mockReset();
  mock.list.mockResolvedValue({ data: [event] });
});
describe('native occurrence SWR feed', () => {
  it('uses one stable empty reference before data and for denied/external feeds', () => {
    expect(visibleNativeOccurrences(undefined, null)).toBe(
      EMPTY_NATIVE_OCCURRENCES
    );
    expect(
      visibleNativeOccurrences([event], new InternalApiError('denied', 403))
    ).toBe(EMPTY_NATIVE_OCCURRENCES);
  });
  it.each([
    new TypeError('Failed to fetch'),
    new InternalApiError('busy', 429),
    new InternalApiError('failed', 503),
    new InternalApiError('verify', 403, 'MFA_REQUIRED'),
  ])('retains authorized rows for recoverable failure %o', (error) => {
    const data = [event];
    expect(visibleNativeOccurrences(data, error)).toBe(data);
  });
  it('loads the requested workspace range using an actor-scoped key', async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(
      () => useNativeCalendarOccurrences('ws', dates, 'UTC', false),
      { wrapper }
    );
    await waitFor(() => expect(result.current.data).toEqual([event]));
    expect(mock.list).toHaveBeenCalledWith(
      'ws',
      { from: '2026-10-05T00:00:00.000Z', to: '2026-10-06T00:00:00.000Z' },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(client.getQueryCache().getAll()[0]?.queryKey).toContain('actor');
  });
  it('retains cached rows while a transient refresh fails', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useNativeCalendarOccurrences('ws', dates, 'UTC', false),
      { wrapper }
    );
    await waitFor(() => expect(result.current.data).toEqual([event]));
    mock.list.mockRejectedValue(new InternalApiError('busy', 429));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toEqual([event]);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
  it.each([401, 403, 404])(
    'clears retained and durable rows after definitive status %s',
    async (status) => {
      const { client, wrapper } = setup();
      const { result } = renderHook(
        () => useNativeCalendarOccurrences('ws', dates, 'UTC', false),
        { wrapper }
      );
      await waitFor(() => expect(result.current.data).toEqual([event]));
      mock.list.mockRejectedValue(new InternalApiError('denied', status));
      await act(async () => {
        await result.current.refetch();
      });
      await waitFor(() =>
        expect(result.current.data).toBe(EMPTY_NATIVE_OCCURRENCES)
      );
      expect(
        client.getQueriesData({ queryKey: nativeOccurrencesKey('ws') })[0]?.[1]
      ).toEqual([]);
    }
  );
  it('does not read native data for externally supplied calendars or empty dates', () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ external, range }) =>
        useNativeCalendarOccurrences('ws', range, 'UTC', external),
      { wrapper, initialProps: { external: true, range: dates } }
    );
    expect(result.current.data).toBe(EMPTY_NATIVE_OCCURRENCES);
    rerender({ external: false, range: [] });
    expect(mock.list).not.toHaveBeenCalled();
  });
  it('does not carry a previous actor snapshot into another account', async () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      () => useNativeCalendarOccurrences('ws', dates, 'UTC', false),
      { wrapper }
    );
    await waitFor(() => expect(result.current.data).toEqual([event]));
    mock.actor.actorId = 'other';
    mock.list.mockImplementation(() => new Promise(() => {}));
    rerender();
    expect(result.current.data).toBe(EMPTY_NATIVE_OCCURRENCES);
  });
});
