const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getWatchPaths } = require('./watch-blue-green/paths.js');
const {
  appendWatcherLogEntry,
  createWatcherLogEntry,
  getLogDeploymentKey,
  readWatcherLogEntries,
} = require('./watch-blue-green/logs.js');

test('getLogDeploymentKey prefers deployment stamp then commit hash', () => {
  assert.equal(
    getLogDeploymentKey({
      commitHash: 'abc123',
      deploymentStamp: '2026-04-22T00-00-00Z',
    }),
    'stamp:2026-04-22T00-00-00Z'
  );
  assert.equal(
    getLogDeploymentKey({
      commitHash: 'abc123',
    }),
    'commit:abc123'
  );
});

test('appendWatcherLogEntry persists newest-first watcher log entries', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-logs-'));
  const paths = getWatchPaths(tempDir);

  try {
    appendWatcherLogEntry(
      {
        level: 'info',
        message: 'First log',
        time: 1,
      },
      { fsImpl: fs, paths }
    );
    appendWatcherLogEntry(
      {
        level: 'warn',
        message: 'Second log',
        time: 2,
      },
      { fsImpl: fs, paths }
    );

    assert.deepEqual(
      readWatcherLogEntries(paths, fs).map((entry) => entry.message),
      ['Second log', 'First log']
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('createWatcherLogEntry links watcher logs to the latest deployment context', () => {
  const entry = createWatcherLogEntry(
    {
      level: 'info',
      message: 'Starting deployment',
      time: 123,
    },
    {
      deployments: [
        {
          activeColor: 'blue',
          commitHash: 'abc123',
          commitShortHash: 'abc123',
          deploymentKind: 'reconcile',
          deploymentStamp: '2026-04-22T00-00-00Z',
          status: 'building',
        },
      ],
    }
  );

  assert.deepEqual(entry, {
    activeColor: 'blue',
    commitHash: 'abc123',
    commitShortHash: 'abc123',
    deploymentKey: 'stamp:2026-04-22T00-00-00Z',
    deploymentKind: 'reconcile',
    deploymentStamp: '2026-04-22T00-00-00Z',
    deploymentStatus: 'building',
    level: 'info',
    message: 'Starting deployment',
    time: 123,
  });
});
