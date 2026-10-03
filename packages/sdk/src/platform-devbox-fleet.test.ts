import { describe, expect, it, vi } from 'vitest';
import { TuturuuuUserClient } from './platform';
import {
  type DevboxFleetSnapshot,
  getInfrastructureOrigin,
  runnerMaintenanceBlocker,
} from './platform-devbox-fleet';

describe('platform-owned fleet boundary', () => {
  it('maps supported local Infrastructure origins and preserves custom origins', () => {
    expect(getInfrastructureOrigin('https://tuturuuu.localhost')).toBe(
      'https://infra.tuturuuu.localhost'
    );
    expect(getInfrastructureOrigin('http://tuturuuu.localhost:1355')).toBe(
      'http://infra.tuturuuu.localhost:1355'
    );
    expect(getInfrastructureOrigin('http://localhost:7803')).toBe(
      'http://localhost:7823'
    );
    expect(getInfrastructureOrigin('http://127.0.0.1:7803')).toBe(
      'http://127.0.0.1:7823'
    );
    expect(getInfrastructureOrigin('https://custom.example:7803')).toBe(
      'https://custom.example:7803'
    );
  });
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
    expect(
      runnerMaintenanceBlocker(
        { ...snapshot, runners: Array.from({ length: 50 }, () => runner) },
        runner,
        1000
      )
    ).toContain('truncated');
  });
});
