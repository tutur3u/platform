const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { getCronSyncDiff, syncWebCrons } = require('./web-crons.js');
const {
  getCronPaths,
  getDueScheduledJobs,
  processWatcherRecoveryRequest,
  runCronCycle,
} = require('./watch-web-crons.js');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createCronConfig() {
  return {
    jobs: [
      {
        description: 'Test job',
        enabled: true,
        id: 'test-job',
        path: '/api/cron/test',
        schedule: '*/15 * * * *',
      },
    ],
  };
}

test('syncWebCrons reports drift when vercel crons differ from shared config', () => {
  const tempDir = makeTempDir('web-crons-sync-');
  const cronConfigPath = path.join(tempDir, 'cron.config.json');
  const vercelConfigPath = path.join(tempDir, 'vercel.json');

  try {
    writeJson(cronConfigPath, createCronConfig());
    writeJson(vercelConfigPath, { crons: [] });

    const diff = getCronSyncDiff({ cronConfigPath, vercelConfigPath });

    assert.equal(diff.expected.crons[0].path, '/api/cron/test');
    assert.equal(
      syncWebCrons({ check: true, cronConfigPath, vercelConfigPath }).changed,
      true
    );
    syncWebCrons({ cronConfigPath, vercelConfigPath });
    assert.equal(getCronSyncDiff({ cronConfigPath, vercelConfigPath }), null);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getDueScheduledJobs detects UTC schedules after the persisted run marker', () => {
  const now = Date.parse('2026-01-01T00:15:30.000Z');
  const state = {
    lastScheduledAtByJobId: {
      'test-job': Date.parse('2026-01-01T00:00:00.000Z'),
    },
  };

  const due = getDueScheduledJobs({
    config: createCronConfig(),
    now,
    state,
  });

  assert.equal(due.length, 1);
  assert.equal(due[0].scheduledAt, Date.parse('2026-01-01T00:15:00.000Z'));
});

test('runCronCycle records an execution with route console logs and advances state once', async () => {
  const tempDir = makeTempDir('web-crons-cycle-');
  const configPath = path.join(tempDir, 'cron.config.json');
  const originalNow = Date.now;
  const paths = getCronPaths({
    controlDir: path.join(tempDir, 'control'),
    runtimeDir: path.join(tempDir, 'runtime'),
  });

  try {
    writeJson(configPath, createCronConfig());
    writeJson(paths.stateFile, {
      lastScheduledAtByJobId: {
        'test-job': Date.parse('2026-01-01T00:00:00.000Z'),
      },
    });

    Date.now = () => Date.parse('2026-01-01T00:15:30.000Z');

    const run = async (command, args) => {
      const joined = [command, ...args].join(' ');
      if (joined.includes('ps -q web-blue')) {
        return { code: 0, stderr: '', stdout: 'blue-123\n' };
      }
      if (joined.includes('ps -q web-green')) {
        return { code: 0, stderr: '', stdout: '' };
      }
      if (joined.includes('docker logs')) {
        return {
          code: 0,
          stderr: '',
          stdout:
            '2026-01-01T00:15:30.000000000Z Error loading scheduled route\n',
        };
      }
      return { code: 1, stderr: 'unexpected command', stdout: '' };
    };
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    });

    const first = await runCronCycle({
      configPath,
      env: { CRON_SECRET: 'secret', INTERNAL_WEB_API_ORIGIN: 'http://web' },
      fetchImpl,
      paths,
      run,
    });
    const second = await runCronCycle({
      configPath,
      env: { CRON_SECRET: 'secret', INTERNAL_WEB_API_ORIGIN: 'http://web' },
      fetchImpl,
      paths,
      run,
    });
    assert.equal(first.executions.length, 1);
    assert.equal(
      first.executions[0].consoleLogs[0].message,
      'Error loading scheduled route'
    );
    assert.equal(second.executions.length, 0);
  } finally {
    Date.now = originalNow;
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runCronCycle leaves queued manual requests untouched while disabled', async () => {
  const tempDir = makeTempDir('web-crons-disabled-');
  const configPath = path.join(tempDir, 'cron.config.json');
  const paths = getCronPaths({
    controlDir: path.join(tempDir, 'control'),
    runtimeDir: path.join(tempDir, 'runtime'),
  });

  try {
    writeJson(configPath, createCronConfig());
    writeJson(paths.controlFile, { enabled: false });
    writeJson(path.join(paths.runRequestsDir, 'request.json'), {
      id: 'request-1',
      jobId: 'test-job',
      requestedAt: 1000,
    });

    const result = await runCronCycle({
      configPath,
      env: { CRON_SECRET: 'secret' },
      fetchImpl: async () => {
        throw new Error('fetch should not run');
      },
      paths,
      run: async () => ({ code: 0, stderr: '', stdout: '' }),
    });

    assert.equal(result.executions.length, 0);
    assert.equal(
      fs.existsSync(path.join(paths.runRequestsDir, 'request.json')),
      true
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runCronCycle consumes enabled manual run requests', async () => {
  const tempDir = makeTempDir('web-crons-manual-');
  const configPath = path.join(tempDir, 'cron.config.json');
  const paths = getCronPaths({
    controlDir: path.join(tempDir, 'control'),
    runtimeDir: path.join(tempDir, 'runtime'),
  });

  try {
    writeJson(configPath, createCronConfig());
    writeJson(path.join(paths.runRequestsDir, 'request.json'), {
      id: 'request-1',
      jobId: 'test-job',
      requestedAt: 1000,
    });

    const result = await runCronCycle({
      configPath,
      env: { CRON_SECRET: 'secret', INTERNAL_WEB_API_ORIGIN: 'http://web' },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => 'ok',
      }),
      paths,
      run: async () => ({ code: 0, stderr: '', stdout: '' }),
    });

    assert.equal(result.executions.length, 1);
    assert.equal(result.executions[0].source, 'manual');
    const status = JSON.parse(fs.readFileSync(paths.statusFile, 'utf8'));
    assert.equal(status.runs[0].id, 'request-1');
    assert.equal(status.runs[0].status, 'success');
    assert.equal(status.runs[0].executionId, result.executions[0].id);
    assert.equal(
      fs.existsSync(path.join(paths.runRequestsDir, 'request.json')),
      false
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('processWatcherRecoveryRequest recreates the watcher and clears the request', async () => {
  const tempDir = makeTempDir('web-crons-watcher-recovery-');
  const paths = getCronPaths({
    controlDir: path.join(tempDir, 'tmp', 'docker-web', 'watch', 'control'),
    runtimeDir: path.join(tempDir, 'tmp', 'docker-web', 'cron'),
  });
  const calls = [];

  try {
    writeJson(paths.watcherRecoveryRequestFile, {
      kind: 'watcher-recovery',
      projectBranch: 'production',
      projectId: 'platform',
      reason: 'branch-mismatch',
      requestedAt: '2026-05-04T08:00:00.000Z',
      requestedBy: 'user-1',
      requestedByEmail: null,
      watcherBranch: 'main',
      watcherHealth: 'live',
    });
    writeJson(
      path.join(
        tempDir,
        'tmp',
        'docker-web',
        'watch',
        'blue-green-auto-deploy.status.json'
      ),
      { status: 'live' }
    );

    const result = await processWatcherRecoveryRequest({
      env: {},
      paths,
      rootDir: tempDir,
      run: async (command, args, options) => {
        calls.push({ args, command, env: options.env });
        return { code: 0, stderr: '', stdout: '' };
      },
    });

    assert.equal(result.status, 'recreated');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, [
      'compose',
      '-f',
      path.join(tempDir, 'docker-compose.web.prod.yml'),
      '--profile',
      'redis',
      'up',
      '--build',
      '--detach',
      '--force-recreate',
      '--remove-orphans',
      'web-blue-green-watcher',
    ]);
    assert.equal(calls[0].command, 'docker');
    assert.equal(calls[0].env.PLATFORM_HOST_WORKSPACE_DIR, tempDir);
    assert.equal(calls[0].env.SUPERMEMORY_BASE_URL, 'http://supermemory:8787');
    assert.equal(calls[0].env.SUPERMEMORY_ENABLED, 'true');
    assert.match(calls[0].env.SUPERMEMORY_API_KEY, /^[a-f0-9]{64}$/u);
    assert.match(calls[0].env.SUPERMEMORY_POSTGRES_PASSWORD, /^[a-f0-9]{64}$/u);
    assert.match(calls[0].env.BETTER_AUTH_SECRET, /^[a-f0-9]{64}$/u);
    assert.equal(fs.existsSync(paths.watcherRecoveryRequestFile), false);
    assert.equal(
      fs.existsSync(
        path.join(
          tempDir,
          'tmp',
          'docker-web',
          'watch',
          'blue-green-auto-deploy.status.json'
        )
      ),
      false
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runCronCycle exposes manual run processing status before completion', async () => {
  const tempDir = makeTempDir('web-crons-manual-live-');
  const configPath = path.join(tempDir, 'cron.config.json');
  const paths = getCronPaths({
    controlDir: path.join(tempDir, 'control'),
    runtimeDir: path.join(tempDir, 'runtime'),
  });
  let resolveFetch;

  try {
    writeJson(configPath, createCronConfig());
    writeJson(path.join(paths.runRequestsDir, 'request.json'), {
      id: 'request-1',
      jobId: 'test-job',
      requestedAt: 1000,
    });

    const pending = runCronCycle({
      configPath,
      env: { CRON_SECRET: 'secret', INTERNAL_WEB_API_ORIGIN: 'http://web' },
      fetchImpl: () =>
        new Promise((resolve) => {
          resolveFetch = () =>
            resolve({
              ok: true,
              status: 200,
              text: async () => 'ok',
            });
        }),
      paths,
      run: async () => ({ code: 0, stderr: '', stdout: '' }),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const statusDuringRun = JSON.parse(
      fs.readFileSync(paths.statusFile, 'utf8')
    );
    assert.equal(statusDuringRun.runs[0].id, 'request-1');
    assert.equal(statusDuringRun.runs[0].status, 'processing');

    resolveFetch();
    const result = await pending;

    assert.equal(result.executions.length, 1);
    const statusAfterRun = JSON.parse(
      fs.readFileSync(paths.statusFile, 'utf8')
    );
    assert.equal(statusAfterRun.runs[0].status, 'success');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});
