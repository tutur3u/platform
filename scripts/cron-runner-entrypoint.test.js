const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getStatusSnapshotHealth,
  shouldRestartForStatusHealth,
} = require('../apps/web/docker/cron-runner-entrypoint.js');

function createSnapshotFsStub(snapshot) {
  return {
    existsSync: () => snapshot !== null,
    readFileSync: () => {
      if (snapshot === 'invalid-json') {
        return '{';
      }

      return JSON.stringify(snapshot);
    },
  };
}

test('cron runner entrypoint treats fresh status snapshots as live', () => {
  const health = getStatusSnapshotHealth({
    fsImpl: createSnapshotFsStub({ updatedAt: 10_000 }),
    now: 20_000,
    startedAt: 0,
    statusFile: '/tmp/status.json',
    staleAfterMs: 15_000,
  });

  assert.equal(health.status, 'live');
  assert.equal(shouldRestartForStatusHealth(health), false);
});

test('cron runner entrypoint allows missing snapshots during startup grace', () => {
  const health = getStatusSnapshotHealth({
    fsImpl: createSnapshotFsStub(null),
    now: 20_000,
    startGraceMs: 30_000,
    startedAt: 0,
    statusFile: '/tmp/status.json',
  });

  assert.equal(health.status, 'starting');
  assert.equal(shouldRestartForStatusHealth(health), false);
});

test('cron runner entrypoint restarts on stale, missing, or invalid status snapshots', () => {
  const stale = getStatusSnapshotHealth({
    fsImpl: createSnapshotFsStub({ updatedAt: 10_000 }),
    now: 30_001,
    startedAt: 0,
    statusFile: '/tmp/status.json',
    staleAfterMs: 20_000,
  });
  const missing = getStatusSnapshotHealth({
    fsImpl: createSnapshotFsStub(null),
    now: 40_001,
    startGraceMs: 30_000,
    startedAt: 0,
    statusFile: '/tmp/status.json',
  });
  const invalid = getStatusSnapshotHealth({
    fsImpl: createSnapshotFsStub('invalid-json'),
    now: 10_000,
    startedAt: 0,
    statusFile: '/tmp/status.json',
  });

  assert.equal(stale.status, 'stale');
  assert.equal(missing.status, 'missing');
  assert.equal(invalid.status, 'invalid');
  assert.equal(shouldRestartForStatusHealth(stale), true);
  assert.equal(shouldRestartForStatusHealth(missing), true);
  assert.equal(shouldRestartForStatusHealth(invalid), true);
});
