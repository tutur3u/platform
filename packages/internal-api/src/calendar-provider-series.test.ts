import { describe, expect, it, vi } from 'vitest';
import {
  getCalendarProviderSeriesOperation,
  reserveCalendarProviderSeriesOperation,
  retryCalendarProviderSeriesOperation,
} from './calendar-provider-series';

function fixture(status: 'pending' | 'applied' = 'pending') {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: status === 'pending' ? 202 : 200,
    json: async () => ({ operationId: 'operation', status }),
  });
  return {
    fetch,
    options: {
      baseUrl: 'https://internal.example.com',
      fetch: fetch as unknown as typeof globalThis.fetch,
    },
  };
}
describe('central provider series operation API', () => {
  it('retains pending admission status and forwards source, idempotency and abort signal', async () => {
    const { fetch, options } = fixture();
    const signal = new AbortController().signal;
    const payload = {
      action: 'create' as const,
      source: { provider: 'google' as const, connectionId: 'connection' },
      requestId: 'request',
      rule: {
        version: 1 as const,
        frequency: 'daily' as const,
        interval: 1,
        timeZone: 'UTC',
        end: { type: 'count' as const, count: 3 },
      },
      anchor: {
        startLocal: '2026-10-05T09:00:00',
        endLocal: '2026-10-05T10:00:00',
        allDay: false,
      },
      event: { title: 'Fixture' },
    };
    expect(
      await reserveCalendarProviderSeriesOperation('workspace/1', payload, {
        ...options,
        signal,
      })
    ).toMatchObject({ status: 'pending' });
    expect(fetch).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%2F1/calendar/series/provider-operations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
      })
    );
  });
  it('reads actor-scoped recovery status without caching', async () => {
    const { fetch, options } = fixture();
    await getCalendarProviderSeriesOperation('ws', 'operation/1', options);
    expect(fetch).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws/calendar/series/provider-operations/operation%2F1',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
  it('retries a retained operation without resending mutable event content', async () => {
    const { fetch, options } = fixture('applied');
    await retryCalendarProviderSeriesOperation('ws', 'operation', options);
    expect(fetch).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws/calendar/series/provider-operations/operation',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined();
  });
});
