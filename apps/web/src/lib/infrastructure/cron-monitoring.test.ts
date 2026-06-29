import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readCronMonitoringSnapshot } from './cron-monitoring';

const ORIGINAL_CWD = process.cwd();
const ORIGINAL_CRON_CONFIG_PATH = process.env.PLATFORM_WEB_CRON_CONFIG_PATH;

function restoreEnv() {
  process.chdir(ORIGINAL_CWD);

  if (ORIGINAL_CRON_CONFIG_PATH === undefined) {
    delete process.env.PLATFORM_WEB_CRON_CONFIG_PATH;
    return;
  }

  process.env.PLATFORM_WEB_CRON_CONFIG_PATH = ORIGINAL_CRON_CONFIG_PATH;
}

function writeCronConfig(configPath: string) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      jobs: [
        {
          description: 'Synchronize payment products.',
          enabled: true,
          id: 'payment-products',
          path: '/api/cron/payment/products',
          schedule: '0 */12 * * *',
        },
      ],
    })
  );
}

describe('readCronMonitoringSnapshot', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('reads cron config from a repo-root working directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-monitoring-'));

    try {
      writeCronConfig(path.join(tempDir, 'apps', 'web', 'cron.config.json'));
      process.chdir(tempDir);

      const snapshot = readCronMonitoringSnapshot();

      expect(snapshot.source.configAvailable).toBe(true);
      expect(snapshot.jobs).toHaveLength(1);
      expect(snapshot.jobs[0]?.id).toBe('payment-products');
    } finally {
      restoreEnv();
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('reads cron config from an app working directory in standalone runtimes', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cron-monitoring-app-cwd-')
    );
    const appDir = path.join(tempDir, 'apps', 'web');

    try {
      writeCronConfig(path.join(appDir, 'cron.config.json'));
      process.chdir(appDir);

      const snapshot = readCronMonitoringSnapshot();

      expect(snapshot.source.configAvailable).toBe(true);
      expect(snapshot.jobs).toHaveLength(1);
      expect(snapshot.jobs[0]?.path).toBe('/api/cron/payment/products');
    } finally {
      restoreEnv();
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('keeps calendar provider sync on the shared 15-minute cadence', () => {
    const repoRootConfigPath = path.join(
      ORIGINAL_CWD,
      'apps',
      'web',
      'cron.config.json'
    );
    const appRootConfigPath = path.join(ORIGINAL_CWD, 'cron.config.json');
    process.env.PLATFORM_WEB_CRON_CONFIG_PATH = fs.existsSync(
      repoRootConfigPath
    )
      ? repoRootConfigPath
      : appRootConfigPath;

    const snapshot = readCronMonitoringSnapshot();
    const calendarProviderSync = snapshot.jobs.find(
      (job) => job.id === 'calendar-provider-sync'
    );

    expect(calendarProviderSync?.schedule).toBe('*/15 * * * *');
  });

  it('merges queued requests and live processing runs into the snapshot', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cron-monitoring-runs-')
    );
    const configFile = path.join(tempDir, 'cron.config.json');
    const runtimeDir = path.join(tempDir, 'runtime');
    const controlDir = path.join(tempDir, 'control');
    const paths = {
      configFile,
      controlDir,
      controlFile: path.join(controlDir, 'cron-control.json'),
      executionDir: path.join(runtimeDir, 'executions'),
      runnerRecoveryRequestFile: path.join(
        controlDir,
        'cron-runner-recovery.request.json'
      ),
      runRequestsDir: path.join(controlDir, 'cron-run-requests'),
      runtimeDir,
      statusFile: path.join(runtimeDir, 'status.json'),
    };

    try {
      writeCronConfig(configFile);
      fs.mkdirSync(paths.runRequestsDir, { recursive: true });
      fs.mkdirSync(paths.runtimeDir, { recursive: true });
      fs.writeFileSync(
        path.join(paths.runRequestsDir, 'request.json'),
        JSON.stringify({
          id: 'request-1',
          jobId: 'payment-products',
          requestedAt: 1000,
          requestedBy: 'user-1',
          requestedByEmail: 'ops@tuturuuu.com',
        })
      );
      fs.writeFileSync(
        paths.statusFile,
        JSON.stringify({
          runs: [
            {
              consoleLogs: [],
              description: 'Synchronize payment products.',
              durationMs: 500,
              endedAt: null,
              error: null,
              executionId: null,
              httpStatus: null,
              id: 'request-2',
              jobId: 'payment-products',
              path: '/api/cron/payment/products',
              requestedAt: 2000,
              requestedBy: 'user-2',
              requestedByEmail: null,
              response: null,
              schedule: '0 */12 * * *',
              source: 'manual',
              startedAt: 2100,
              status: 'processing',
              updatedAt: 2500,
            },
          ],
          updatedAt: 2500,
        })
      );

      const snapshot = readCronMonitoringSnapshot({
        now: 3000,
        paths,
      });

      expect(snapshot.runs.map((run) => run.status)).toEqual([
        'processing',
        'queued',
      ]);
      expect(snapshot.overview.processingRuns).toBe(1);
      expect(snapshot.overview.queuedRuns).toBe(1);
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('includes pending cron runner recovery requests in the snapshot', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cron-monitoring-runner-recovery-')
    );
    const configFile = path.join(tempDir, 'cron.config.json');
    const runtimeDir = path.join(tempDir, 'runtime');
    const controlDir = path.join(tempDir, 'control');
    const paths = {
      configFile,
      controlDir,
      controlFile: path.join(controlDir, 'cron-control.json'),
      executionDir: path.join(runtimeDir, 'executions'),
      runnerRecoveryRequestFile: path.join(
        controlDir,
        'cron-runner-recovery.request.json'
      ),
      runRequestsDir: path.join(controlDir, 'cron-run-requests'),
      runtimeDir,
      statusFile: path.join(runtimeDir, 'status.json'),
    };

    try {
      writeCronConfig(configFile);
      fs.mkdirSync(controlDir, { recursive: true });
      fs.writeFileSync(
        paths.runnerRecoveryRequestFile,
        JSON.stringify({
          action: 'restart',
          attemptCount: 1,
          kind: 'cron-runner-recovery',
          lastAttemptAt: 1_700_000_000_000,
          lastError: 'compose failed',
          reason: 'operator-requested-restart',
          requestedAt: '2026-06-29T00:00:00.000Z',
          requestedBy: 'user-1',
          requestedByEmail: 'ops@tuturuuu.com',
        })
      );

      const snapshot = readCronMonitoringSnapshot({
        paths,
      });

      expect(snapshot.runnerRecoveryRequest).toMatchObject({
        action: 'restart',
        attemptCount: 1,
        kind: 'cron-runner-recovery',
        lastError: 'compose failed',
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
