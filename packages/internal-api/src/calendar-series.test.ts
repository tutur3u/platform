import { describe, expect, it, vi } from 'vitest';
import {
  createNativeCalendarSeries,
  getNativeCalendarSeries,
  listNativeCalendarOccurrences,
  listNativeCalendarSeries,
  mutateNativeCalendarSeries,
} from './calendar-series';

const rule = {
  version: 1 as const,
  frequency: 'daily' as const,
  interval: 1,
  timeZone: 'UTC',
  end: { type: 'count' as const, count: 5 },
};
const anchor = {
  startLocal: '2026-10-05T09:00:00',
  endLocal: '2026-10-05T10:00:00',
  allDay: false,
};
function fixture() {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  return {
    fetch,
    options: {
      baseUrl: 'https://internal.example.com',
      fetch: fetch as unknown as typeof globalThis.fetch,
    },
  };
}
describe('centralized native series API', () => {
  it('encodes workspace/series identifiers and forwards aborts', async () => {
    const { fetch, options } = fixture();
    const signal = new AbortController().signal;
    await getNativeCalendarSeries('workspace 1', 'series/1', {
      ...options,
      signal,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/calendar/series/series%2F1',
      expect.objectContaining({ signal, cache: 'no-store' })
    );
  });
  it('keeps listing and bounded viewport reads distinct', async () => {
    const { fetch, options } = fixture();
    await listNativeCalendarSeries('ws', options);
    expect(fetch.mock.calls[0]![0]).toBe(
      'https://internal.example.com/api/v1/workspaces/ws/calendar/series'
    );
    await listNativeCalendarOccurrences(
      'ws',
      { from: '2026-10-05T00:00:00Z', to: '2026-10-10T00:00:00Z', limit: 20 },
      options
    );
    const url = new URL(fetch.mock.calls[1]![0]);
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('from')).toBe('2026-10-05T00:00:00Z');
  });
  it('retains create rule, anchor, and idempotency identity', async () => {
    const { fetch, options } = fixture();
    await createNativeCalendarSeries(
      'ws',
      { requestId: 'id', rule, anchor, event: { title: 'Synthetic' } },
      options
    );
    expect(fetch.mock.calls[0]![1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0]![1].body).anchor).toEqual(anchor);
  });
  it.each([
    ['update', 'PUT'],
    ['delete', 'DELETE'],
  ] as const)(
    'carries concurrency/immutable slot for %s',
    async (action, method) => {
      const { fetch, options } = fixture();
      const payload = {
        requestId: 'id',
        expectedRevision: 3,
        scope: 'future' as const,
        originalStartLocal: anchor.startLocal,
      };
      await mutateNativeCalendarSeries(
        'ws',
        'series',
        payload,
        action,
        options
      );
      expect(fetch.mock.calls[0]![1].method).toBe(method);
      expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(payload);
    }
  );
});
