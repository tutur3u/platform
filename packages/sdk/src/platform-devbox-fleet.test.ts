import { describe, expect, it, vi } from 'vitest';
import { TuturuuuUserClient } from './platform';
import {
  type DevboxFleetSnapshot,
  getInfrastructureOrigin,
  runnerMaintenanceBlocker,
} from './platform-devbox-fleet';

describe('platform-owned fleet boundary', () => {
  it('authenticates Infrastructure requests without sending custom deployment tokens there', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ runners: [], runs: [], leases: [] })
      );
    for (const baseUrl of ['https://tuturuuu.com', 'https://private.example']) {
      const client = new TuturuuuUserClient({
        accessToken: 'test-token',
        baseUrl,
        fetch: fetchMock,
      });
      await client.devboxes.fleet.snapshot();
      const [url, init] = fetchMock.mock.calls.at(-1)!;
      expect(String(url)).toBe(
        `${getInfrastructureOrigin(baseUrl)}/api/v1/infrastructure/devboxes`
      );
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        'Bearer test-token'
      );
    }
  });
  it('fails closed for busy, stale and truncated snapshots', () => {
    const runner = {
      id: 'one',
      name: 'one',
      status: 'online',
      last_heartbeat_at: new Date(1000).toISOString(),
      heartbeat_enabled: true,
      enabled_features: {},
      resource_limits: null,
      capabilities: {},
    };
    const snapshot: DevboxFleetSnapshot = {
      runners: [runner],
      runs: [],
      leases: [],
    };
    expect(runnerMaintenanceBlocker(snapshot, runner, 1000)).toBeUndefined();
    expect(runnerMaintenanceBlocker(snapshot, runner, 61_000)).toContain(
      'stale'
    );
    expect(
      runnerMaintenanceBlocker(
        {
          ...snapshot,
          leases: [{ id: 'lease', runner_id: 'one', status: 'active' }],
        },
        runner,
        1000
      )
    ).toContain('active lease');
    expect(
      runnerMaintenanceBlocker(
        {
          ...snapshot,
          runs: Array.from({ length: 50 }, () => ({
            id: 'old',
            runner_id: null,
            status: 'succeeded',
          })),
        },
        runner,
        1000
      )
    ).toContain('truncated');
  });
});
