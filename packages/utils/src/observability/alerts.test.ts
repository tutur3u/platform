import { describe, expect, it } from 'vitest';
import { parseAlerts } from './alerts';

const firing = {
  burn_long: 20.5,
  burn_short: 30,
  dedupe_key: 'slo:workers-availability:page:tuturuuu-meet:20261121t0300',
  indicator: 'availability',
  latency_threshold_ms: null,
  objective: 0.995,
  resolved_at: null,
  service: 'tuturuuu-meet',
  severity: 'page',
  slo_id: 'workers-availability',
  started_at: '2026-11-21T03:00:00Z',
  state: 'firing',
};

describe('parseAlerts', () => {
  it('rejects a non-array', () => {
    expect(parseAlerts({})).toBeNull();
    expect(parseAlerts(null)).toBeNull();
  });

  it('drops malformed rows and keeps well-formed ones', () => {
    expect(
      parseAlerts([
        firing,
        { service: 'x' },
        null,
        { ...firing, severity: 'critical' },
        { ...firing, state: 'open' },
        { ...firing, burn_long: '20' },
        { ...firing, started_at: 'yesterday' },
      ])
    ).toEqual([firing]);
  });

  it('keeps resolved alerts for callers that show recent history', () => {
    const resolved = {
      ...firing,
      state: 'resolved',
      resolved_at: '2026-11-21T04:00:00Z',
    };
    expect(parseAlerts([resolved])).toEqual([resolved]);
  });
});
