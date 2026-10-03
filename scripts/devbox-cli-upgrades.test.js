const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('./devbox-cli-upgrades.ts');

describe('fleet upgrade eligibility', () => {
  const now = Date.parse('2026-10-04T00:00:00Z');
  const runner = {
    id: 'allowed',
    name: 'fixture',
    status: 'online',
    last_heartbeat_at: new Date(now - 1000).toISOString(),
    capabilities: { cli: { version: '0.26.0' }, os: { hostname: 'host' } },
  };
  it('upgrades only allowlisted, online, idle, older stable runners', async () => {
    const { planUpgrades } = await modulePromise;
    const snapshot = {
      runners: [
        runner,
        { ...runner, id: 'other' },
        { ...runner, id: 'revoked', status: 'revoked' },
        {
          ...runner,
          id: 'busy',
          capabilities: {
            ...runner.capabilities,
            os: { hostname: 'busy-host' },
          },
        },
        {
          ...runner,
          id: 'stale',
          last_heartbeat_at: new Date(now - 60_000).toISOString(),
        },
      ],
      runs: [{ runner_id: 'busy', status: 'running' }],
    };
    assert.deepEqual(
      planUpgrades(
        snapshot,
        ['allowed', 'busy', 'revoked', 'stale'],
        '0.27.0',
        now
      ),
      [runner]
    );
  });
  it('defers a runner whose hostname cannot establish host idleness', async () => {
    const { planUpgrades } = await modulePromise;
    assert.equal(
      planUpgrades(
        {
          runners: [
            { ...runner, capabilities: { cli: runner.capabilities.cli } },
          ],
          runs: [],
          leases: [],
        },
        ['allowed'],
        '0.27.0',
        now
      ).length,
      0
    );
  });
  it('does not reinstall, downgrade, or install prereleases', async () => {
    const { planUpgrades } = await modulePromise;
    const snapshot = { runners: [runner], runs: [] };
    assert.deepEqual(planUpgrades(snapshot, ['allowed'], '0.26.0', now), []);
    assert.deepEqual(planUpgrades(snapshot, ['allowed'], '0.25.0', now), []);
    assert.throws(
      () => planUpgrades(snapshot, ['allowed'], '0.27.0-beta.1', now),
      /stable release/
    );
  });
  it('defers when an upgrade or ordinary run is already queued for the runner', async () => {
    const { planUpgrades } = await modulePromise;
    assert.deepEqual(
      planUpgrades(
        {
          runners: [runner],
          runs: [{ runner_id: 'allowed', status: 'queued' }],
        },
        ['allowed'],
        '0.27.0',
        now
      ),
      []
    );
  });
  it('defers all runners sharing a host while one sibling has work', async () => {
    const { planUpgrades } = await modulePromise;
    const first = {
      ...runner,
      capabilities: { ...runner.capabilities, os: { hostname: 'shared' } },
    };
    const second = { ...first, id: 'sibling' };
    assert.deepEqual(
      planUpgrades(
        {
          runners: [first, second],
          runs: [{ runner_id: 'sibling', status: 'running' }],
        },
        ['allowed'],
        '0.27.0',
        now
      ),
      []
    );
    assert.deepEqual(
      planUpgrades(
        {
          runners: [first],
          runs: Array.from({ length: 50 }, () => ({
            runner_id: null,
            status: 'succeeded',
          })),
        },
        ['allowed'],
        '0.27.0',
        now
      ),
      []
    );
  });
  it('fails closed when the runner list itself reaches its page limit', async () => {
    const { planUpgrades } = await modulePromise;
    assert.deepEqual(
      planUpgrades(
        { runners: Array.from({ length: 50 }, () => runner), runs: [] },
        ['allowed'],
        '0.27.0',
        now
      ),
      []
    );
  });
});
