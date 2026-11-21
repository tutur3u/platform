import { describe, expect, it, vi } from 'vitest';
import type { ObservabilityAlert } from '@tuturuuu/utils/observability/alerts';
import {
  FLEET_MAX_ALERTS,
  fleetAlertId,
  fleetAlertView,
  readFleetAlerts,
  resetFleetAlertsCache,
} from './alerts';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    throw new Error('not in unit tests');
  },
}));

const alert = (overrides: Partial<ObservabilityAlert>): ObservabilityAlert => ({
  burn_long: 15,
  burn_short: 16,
  dedupe_key: 'slo:a:page:web:20261121t0300',
  indicator: 'availability',
  latency_threshold_ms: null,
  objective: 0.995,
  resolved_at: null,
  service: 'web',
  severity: 'page',
  slo_id: 'a',
  started_at: '2026-11-21T03:00:00Z',
  state: 'firing',
  ...overrides,
});

describe('fleet alert shaping', () => {
  it('derives a bounded slug that keeps distinct keys distinct', () => {
    const long = `slo:${'x'.repeat(120)}:page:web:20261121t0300`;
    for (const key of [long, ':odd', 'slo:a:b', 'slo-a-b'])
      expect(fleetAlertId(key)).toMatch(/^[a-z0-9][a-z0-9._-]{0,63}$/);
    expect(fleetAlertId('slo:a:b')).not.toBe(fleetAlertId('slo-a-b'));
    expect(fleetAlertId('slo:a:b')).toBe(fleetAlertId('slo:a:b'));
  });

  it('keeps firing alerts, page before ticket, then newest, capped', () => {
    const view = fleetAlertView([
      alert({
        dedupe_key: 't',
        severity: 'ticket',
        started_at: '2026-11-21T05:00:00Z',
      }),
      alert({ dedupe_key: 'old', started_at: '2026-11-21T01:00:00Z' }),
      alert({ dedupe_key: 'new', started_at: '2026-11-21T04:00:00Z' }),
      alert({ dedupe_key: 'done', state: 'resolved' }),
    ]);
    expect(view.map((a) => a.id.split('-')[0])).toEqual(['new', 'old', 't']);
    const many = Array.from({ length: 30 }, (_, i) =>
      alert({ dedupe_key: `k${i}` })
    );
    expect(fleetAlertView(many)).toHaveLength(FLEET_MAX_ALERTS);
  });

  it('memoizes failures briefly and successes for a minute', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetFleetAlertsCache();
    const failing = vi.fn(async () => {
      throw new Error('down');
    });
    expect(await readFleetAlerts({ now: 0, load: failing })).toBeNull();
    expect(await readFleetAlerts({ now: 10_000, load: failing })).toBeNull();
    expect(failing).toHaveBeenCalledTimes(1);
    const ok = vi.fn(async () => [alert({})]);
    expect(await readFleetAlerts({ now: 16_000, load: ok })).toHaveLength(1);
    expect(await readFleetAlerts({ now: 70_000, load: ok })).toHaveLength(1);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(await readFleetAlerts({ now: 77_000, load: ok })).toHaveLength(1);
    expect(ok).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('treats a nonempty list without a usable row as unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetFleetAlertsCache();
    expect(
      await readFleetAlerts({ now: 0, load: async () => [{ service: 'x' }] })
    ).toBeNull();
    resetFleetAlertsCache();
    expect(await readFleetAlerts({ now: 0, load: async () => [] })).toEqual([]);
    warn.mockRestore();
  });

  it('cancels a stalled read at the deadline', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetFleetAlertsCache();
    let signal: AbortSignal | undefined;
    const read = readFleetAlerts({
      now: 0,
      load: (s) => {
        signal = s;
        return new Promise(() => {});
      },
    });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await read).toBeNull();
    expect(signal?.aborted).toBe(true);
    warn.mockRestore();
    vi.useRealTimers();
  });
});
