const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getWatchPaths } = require('./watch-blue-green/paths.js');
const {
  clearDeploymentPin,
  clearInstantRolloutRequest,
  readDeploymentPin,
  readInstantRolloutRequest,
  writeDeploymentPin,
  writeInstantRolloutRequest,
} = require('./watch-blue-green/control.js');

test('instant rollout control requests persist and clear cleanly', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-control-'));
  const paths = getWatchPaths(tempDir);

  try {
    writeInstantRolloutRequest(
      {
        kind: 'sync-standby',
        requestedAt: '2026-04-23T10:00:00.000Z',
        requestedBy: 'user-1',
        requestedByEmail: 'ops@platform.test',
      },
      { fsImpl: fs, paths }
    );

    assert.deepEqual(readInstantRolloutRequest(paths, fs), {
      kind: 'sync-standby',
      requestedAt: '2026-04-23T10:00:00.000Z',
      requestedBy: 'user-1',
      requestedByEmail: 'ops@platform.test',
    });

    clearInstantRolloutRequest({ fsImpl: fs, paths });

    assert.equal(readInstantRolloutRequest(paths, fs), null);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('deployment pin control persists and clears cleanly', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-control-pin-'));
  const paths = getWatchPaths(tempDir);

  try {
    writeDeploymentPin(
      {
        commitHash: 'abc123456789',
        commitShortHash: 'abc1234',
        commitSubject: 'Rollback target',
        deploymentStamp: 'deploy-2026-04-23T10-00-00Z',
        kind: 'deployment-pin',
        requestedAt: '2026-04-23T10:00:00.000Z',
        requestedBy: 'user-1',
        requestedByEmail: 'ops@platform.test',
      },
      { fsImpl: fs, paths }
    );

    assert.deepEqual(readDeploymentPin(paths, fs), {
      commitHash: 'abc123456789',
      commitShortHash: 'abc1234',
      commitSubject: 'Rollback target',
      deploymentStamp: 'deploy-2026-04-23T10-00-00Z',
      kind: 'deployment-pin',
      requestedAt: '2026-04-23T10:00:00.000Z',
      requestedBy: 'user-1',
      requestedByEmail: 'ops@platform.test',
    });

    clearDeploymentPin({ fsImpl: fs, paths });

    assert.equal(readDeploymentPin(paths, fs), null);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});
