import { describe, expect, it, vi } from 'vitest';
import {
  loadPushLatency,
  PUSH_LATENCY_WINDOW_MS,
  summarizePushLatency,
} from './push-latency';

describe('push latency', () => {
  it('orders SQL channel aggregates and drops unknown or empty rows', () => {
    expect(
      summarizePushLatency([
        {
          channel: 'tasks',
          sent_count: '4',
          p50_ms: 1500.4,
          p95_ms: 20_000,
          max_ms: 20_000,
        },
        {
          channel: 'mail',
          sent_count: 2,
          p50_ms: 800,
          p95_ms: 1200.6,
          max_ms: 1300,
        },
        { channel: 'chat', sent_count: 0, p50_ms: 1, p95_ms: 1, max_ms: 1 },
        { channel: 'unknown', sent_count: 3, p50_ms: 1, p95_ms: 1, max_ms: 1 },
      ])
    ).toEqual([
      { channel: 'mail', sentCount: 2, p50Ms: 800, p95Ms: 1201, maxMs: 1300 },
      {
        channel: 'tasks',
        sentCount: 4,
        p50Ms: 1500,
        p95Ms: 20_000,
        maxMs: 20_000,
      },
    ]);
  });

  it('queries the bounded window and reports failures as an error state', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const sbAdmin = { schema: vi.fn(() => ({ rpc })) };
    const now = Date.parse('2026-11-21T12:00:00.000Z');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await loadPushLatency(sbAdmin, now)).toEqual({
      status: 'ready',
      channels: [],
    });
    expect(sbAdmin.schema).toHaveBeenCalledWith('private');
    expect(rpc).toHaveBeenCalledWith('push_delivery_latency_summary', {
      p_since: new Date(now - PUSH_LATENCY_WINDOW_MS).toISOString(),
    });
    expect(await loadPushLatency(sbAdmin, now)).toEqual({ status: 'error' });
  });
});
