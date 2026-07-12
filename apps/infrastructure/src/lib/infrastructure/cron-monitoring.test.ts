import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readCronMonitoringSnapshot,
  withManagedExternalCronDiagnostics,
} from './cron-monitoring';

const ORIGINAL_CWD = process.cwd();
const ORIGINAL_INFRA_CRON_CONFIG_PATH =
  process.env.PLATFORM_INFRA_CRON_CONFIG_PATH;
const ORIGINAL_WEB_CRON_CONFIG_PATH = process.env.PLATFORM_WEB_CRON_CONFIG_PATH;
const ORIGINAL_DOCKER_CONTROL_TOKEN = process.env.PLATFORM_DOCKER_CONTROL_TOKEN;
const ORIGINAL_DOCKER_CONTROL_URL = process.env.PLATFORM_DOCKER_CONTROL_URL;

function restoreEnv() {
  process.chdir(ORIGINAL_CWD);

  if (ORIGINAL_INFRA_CRON_CONFIG_PATH === undefined) {
    delete process.env.PLATFORM_INFRA_CRON_CONFIG_PATH;
  } else {
    process.env.PLATFORM_INFRA_CRON_CONFIG_PATH =
      ORIGINAL_INFRA_CRON_CONFIG_PATH;
  }

  if (ORIGINAL_WEB_CRON_CONFIG_PATH === undefined) {
    delete process.env.PLATFORM_WEB_CRON_CONFIG_PATH;
  } else {
    process.env.PLATFORM_WEB_CRON_CONFIG_PATH = ORIGINAL_WEB_CRON_CONFIG_PATH;
  }

  if (ORIGINAL_DOCKER_CONTROL_TOKEN === undefined) {
    delete process.env.PLATFORM_DOCKER_CONTROL_TOKEN;
  } else {
    process.env.PLATFORM_DOCKER_CONTROL_TOKEN = ORIGINAL_DOCKER_CONTROL_TOKEN;
  }

  if (ORIGINAL_DOCKER_CONTROL_URL === undefined) {
    delete process.env.PLATFORM_DOCKER_CONTROL_URL;
  } else {
    process.env.PLATFORM_DOCKER_CONTROL_URL = ORIGINAL_DOCKER_CONTROL_URL;
  }
}

function writeCronConfig(
  configPath: string,
  jobs = [
    {
      description: 'Synchronize payment products.',
      enabled: true,
      id: 'payment-products',
      path: '/api/cron/payment/products',
      schedule: '0 */12 * * *',
    },
  ]
) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      jobs,
    })
  );
}

function createCronMonitoringPaths(tempDir: string) {
  const configFile = path.join(tempDir, 'cron.config.json');
  const runtimeDir = path.join(tempDir, 'runtime');
  const controlDir = path.join(tempDir, 'control');

  return {
    configFile,
    controlDir,
    controlFile: path.join(controlDir, 'cron-control.json'),
    dockerControlStatusFile: path.join(
      runtimeDir,
      '..',
      'docker-control',
      'status.json'
    ),
    executionDir: path.join(runtimeDir, 'executions'),
    runnerRecoveryRequestFile: path.join(
      controlDir,
      'cron-runner-recovery.request.json'
    ),
    runRequestsDir: path.join(controlDir, 'cron-run-requests'),
    runtimeDir,
    statusFile: path.join(runtimeDir, 'status.json'),
    watcherStatusFile: path.join(
      runtimeDir,
      '..',
      'watch',
      'blue-green-auto-deploy.status.json'
    ),
  };
}

describe('readCronMonitoringSnapshot', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('reads cron config from a repo-root working directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-monitoring-'));

    try {
      writeCronConfig(
        path.join(tempDir, 'apps', 'infrastructure', 'cron.config.json')
      );
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
    const appDir = path.join(tempDir, 'apps', 'infrastructure');

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

  it('keeps trust cache sync on the infra 10-minute cadence', () => {
    const repoRootConfigPath = path.join(
      ORIGINAL_CWD,
      'apps',
      'infrastructure',
      'cron.config.json'
    );
    const appRootConfigPath = path.join(ORIGINAL_CWD, 'cron.config.json');
    process.env.PLATFORM_INFRA_CRON_CONFIG_PATH = fs.existsSync(
      repoRootConfigPath
    )
      ? repoRootConfigPath
      : appRootConfigPath;

    const snapshot = readCronMonitoringSnapshot();
    const trustCacheSync = snapshot.jobs.find(
      (job) => job.id === 'infrastructure-sync-trust-cache'
    );

    expect(trustCacheSync?.schedule).toBe('*/10 * * * *');
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
      dockerControlStatusFile: path.join(
        runtimeDir,
        '..',
        'docker-control',
        'status.json'
      ),
      executionDir: path.join(runtimeDir, 'executions'),
      runnerRecoveryRequestFile: path.join(
        controlDir,
        'cron-runner-recovery.request.json'
      ),
      runRequestsDir: path.join(controlDir, 'cron-run-requests'),
      runtimeDir,
      statusFile: path.join(runtimeDir, 'status.json'),
      watcherStatusFile: path.join(
        runtimeDir,
        '..',
        'watch',
        'blue-green-auto-deploy.status.json'
      ),
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

  it('derives future next-run metadata when persisted schedule fields are stale', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cron-monitoring-next-run-')
    );
    const paths = createCronMonitoringPaths(tempDir);

    try {
      writeCronConfig(paths.configFile);
      fs.mkdirSync(paths.runtimeDir, { recursive: true });
      fs.writeFileSync(
        paths.statusFile,
        JSON.stringify({
          jobs: [
            {
              description: 'Stale persisted description.',
              enabled: true,
              id: 'payment-products',
              nextRunAt: Date.parse('2025-12-25T00:00:00.000Z'),
              path: '/api/cron/old-payment-products',
              schedule: '0 0 * * *',
            },
          ],
          nextRunAt: Date.parse('2025-12-25T00:00:00.000Z'),
          updatedAt: Date.parse('2025-12-25T00:00:00.000Z'),
        })
      );

      const snapshot = readCronMonitoringSnapshot({
        now: Date.parse('2026-01-01T00:15:30.000Z'),
        paths,
      });

      expect(snapshot.status).toBe('stale');
      expect(snapshot.nextRunAt).toBe(Date.parse('2026-01-01T12:00:00.000Z'));
      expect(snapshot.jobs[0]).toMatchObject({
        description: 'Synchronize payment products.',
        enabled: true,
        nextRunAt: Date.parse('2026-01-01T12:00:00.000Z'),
        path: '/api/cron/payment/products',
        schedule: '0 */12 * * *',
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('keeps disabled jobs out of next-run metadata even with stale persisted values', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cron-monitoring-disabled-next-run-')
    );
    const paths = createCronMonitoringPaths(tempDir);

    try {
      writeCronConfig(paths.configFile);
      fs.mkdirSync(paths.runtimeDir, { recursive: true });
      fs.mkdirSync(paths.controlDir, { recursive: true });
      fs.writeFileSync(
        paths.controlFile,
        JSON.stringify({
          enabled: true,
          jobs: {
            'payment-products': {
              enabled: false,
              updatedAt: 1000,
              updatedBy: 'user-1',
              updatedByEmail: null,
            },
          },
          updatedAt: 1000,
        })
      );
      fs.writeFileSync(
        paths.statusFile,
        JSON.stringify({
          jobs: [
            {
              enabled: true,
              id: 'payment-products',
              nextRunAt: Date.parse('2025-12-25T00:00:00.000Z'),
            },
          ],
          nextRunAt: Date.parse('2025-12-25T00:00:00.000Z'),
          updatedAt: Date.parse('2025-12-25T00:00:00.000Z'),
        })
      );

      const snapshot = readCronMonitoringSnapshot({
        now: Date.parse('2026-01-01T00:15:30.000Z'),
        paths,
      });

      expect(snapshot.nextRunAt).toBeNull();
      expect(snapshot.jobs[0]?.enabled).toBe(false);
      expect(snapshot.jobs[0]?.nextRunAt).toBeNull();
      expect(snapshot.status).toBe('stale');
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
      dockerControlStatusFile: path.join(
        runtimeDir,
        '..',
        'docker-control',
        'status.json'
      ),
      executionDir: path.join(runtimeDir, 'executions'),
      runnerRecoveryRequestFile: path.join(
        controlDir,
        'cron-runner-recovery.request.json'
      ),
      runRequestsDir: path.join(controlDir, 'cron-run-requests'),
      runtimeDir,
      statusFile: path.join(runtimeDir, 'status.json'),
      watcherStatusFile: path.join(
        runtimeDir,
        '..',
        'watch',
        'blue-green-auto-deploy.status.json'
      ),
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
        now: Date.parse('2026-06-29T00:00:30.000Z'),
        paths,
      });

      expect(snapshot.runnerRecoveryRequest).toMatchObject({
        action: 'restart',
        attemptCount: 1,
        kind: 'cron-runner-recovery',
        lastError: 'compose failed',
      });
      expect(snapshot.recovery.canRequest).toBe(false);
      expect(snapshot.recovery.consumer).toBe('none');
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('marks stale cron runner recovery requests as replaceable', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cron-monitoring-stale-recovery-')
    );
    const configFile = path.join(tempDir, 'cron.config.json');
    const runtimeDir = path.join(tempDir, 'runtime');
    const controlDir = path.join(tempDir, 'control');
    const paths = {
      configFile,
      controlDir,
      controlFile: path.join(controlDir, 'cron-control.json'),
      dockerControlStatusFile: path.join(
        runtimeDir,
        '..',
        'docker-control',
        'status.json'
      ),
      executionDir: path.join(runtimeDir, 'executions'),
      runnerRecoveryRequestFile: path.join(
        controlDir,
        'cron-runner-recovery.request.json'
      ),
      runRequestsDir: path.join(controlDir, 'cron-run-requests'),
      runtimeDir,
      statusFile: path.join(runtimeDir, 'status.json'),
      watcherStatusFile: path.join(
        runtimeDir,
        '..',
        'watch',
        'blue-green-auto-deploy.status.json'
      ),
    };

    try {
      writeCronConfig(configFile);
      fs.mkdirSync(controlDir, { recursive: true });
      fs.writeFileSync(
        paths.runnerRecoveryRequestFile,
        JSON.stringify({
          action: 'ensure',
          attemptCount: 0,
          kind: 'cron-runner-recovery',
          lastAttemptAt: null,
          lastError: null,
          reason: 'operator-requested-ensure',
          requestedAt: '2026-06-29T00:00:00.000Z',
          requestedBy: 'user-1',
          requestedByEmail: 'ops@tuturuuu.com',
        })
      );

      const snapshot = readCronMonitoringSnapshot({
        now: Date.parse('2026-06-29T00:03:00.000Z'),
        paths,
      });

      expect(snapshot.recovery.requestIsStale).toBe(true);
      expect(snapshot.recovery.canRequest).toBe(true);
      expect(snapshot.recovery.blockedReason).toMatch(/stalled/u);
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('reads direct Docker control health from the runtime status file', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cron-monitoring-docker-control-')
    );
    const configFile = path.join(tempDir, 'cron.config.json');
    const runtimeDir = path.join(tempDir, 'runtime');
    const controlDir = path.join(tempDir, 'control');
    const paths = {
      configFile,
      controlDir,
      controlFile: path.join(controlDir, 'cron-control.json'),
      dockerControlStatusFile: path.join(
        runtimeDir,
        '..',
        'docker-control',
        'status.json'
      ),
      executionDir: path.join(runtimeDir, 'executions'),
      runnerRecoveryRequestFile: path.join(
        controlDir,
        'cron-runner-recovery.request.json'
      ),
      runRequestsDir: path.join(controlDir, 'cron-run-requests'),
      runtimeDir,
      statusFile: path.join(runtimeDir, 'status.json'),
      watcherStatusFile: path.join(
        runtimeDir,
        '..',
        'watch',
        'blue-green-auto-deploy.status.json'
      ),
    };

    try {
      writeCronConfig(configFile);
      fs.mkdirSync(path.dirname(paths.dockerControlStatusFile), {
        recursive: true,
      });
      fs.writeFileSync(
        paths.dockerControlStatusFile,
        JSON.stringify({
          kind: 'docker-control-status',
          lastRecovery: {
            action: 'restart',
            completedAt: '2026-06-29T00:00:05.000Z',
            durationMs: 5000,
            requestedAt: '2026-06-29T00:00:00.000Z',
            status: 'succeeded',
          },
          updatedAt: Date.parse('2026-06-29T00:00:30.000Z'),
        })
      );

      const snapshot = readCronMonitoringSnapshot({
        now: Date.parse('2026-06-29T00:01:00.000Z'),
        paths,
      });

      expect(snapshot.recovery.directControl.status).toBe('live');
      expect(snapshot.recovery.directControl.lastRecovery).toMatchObject({
        action: 'restart',
        status: 'succeeded',
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('emits a stale runner diagnostic without a pending recovery request', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cron-monitoring-runner-diagnostic-')
    );
    const paths = createCronMonitoringPaths(tempDir);

    try {
      writeCronConfig(paths.configFile);
      fs.mkdirSync(paths.runtimeDir, { recursive: true });
      fs.writeFileSync(
        paths.statusFile,
        JSON.stringify({
          updatedAt: Date.parse('2026-06-29T00:00:00.000Z'),
        })
      );

      const snapshot = readCronMonitoringSnapshot({
        now: Date.parse('2026-06-29T00:03:00.000Z'),
        paths,
      });

      expect(snapshot.runnerRecoveryRequest).toBeNull();
      expect(snapshot.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'runner_not_live',
            severity: 'error',
          }),
        ])
      );
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('emits a watcher diagnostic while direct Docker control is live', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cron-monitoring-watcher-diagnostic-')
    );
    const paths = createCronMonitoringPaths(tempDir);

    try {
      process.env.PLATFORM_DOCKER_CONTROL_TOKEN = 'test-token';
      process.env.PLATFORM_DOCKER_CONTROL_URL =
        'http://web-docker-control:7810';
      writeCronConfig(paths.configFile);
      fs.mkdirSync(paths.runtimeDir, { recursive: true });
      fs.writeFileSync(
        paths.statusFile,
        JSON.stringify({
          updatedAt: Date.parse('2026-06-29T00:00:30.000Z'),
        })
      );
      fs.mkdirSync(path.dirname(paths.dockerControlStatusFile), {
        recursive: true,
      });
      fs.writeFileSync(
        paths.dockerControlStatusFile,
        JSON.stringify({
          kind: 'docker-control-status',
          updatedAt: Date.parse('2026-06-29T00:00:30.000Z'),
          watchdog: {
            enabled: true,
            lastCheckedAt: Date.parse('2026-06-29T00:00:30.000Z'),
            status: 'healthy',
          },
        })
      );

      const snapshot = readCronMonitoringSnapshot({
        now: Date.parse('2026-06-29T00:01:00.000Z'),
        paths,
      });

      expect(snapshot.recovery.consumer).toBe('direct-control');
      expect(snapshot.recovery.directControl.watchdog?.status).toBe('healthy');
      expect(snapshot.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'watcher_not_live',
            severity: 'warning',
          }),
        ])
      );
      expect(snapshot.diagnostics).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'docker_control_not_live',
          }),
        ])
      );
    } finally {
      restoreEnv();
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('emits route-origin failure diagnostics from the latest failed execution', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cron-monitoring-route-origin-diagnostic-')
    );
    const paths = createCronMonitoringPaths(tempDir);

    try {
      writeCronConfig(paths.configFile);
      fs.mkdirSync(paths.runtimeDir, { recursive: true });
      fs.writeFileSync(
        paths.statusFile,
        JSON.stringify({
          lastExecution: {
            consoleLogs: [],
            description: 'Synchronize payment products.',
            durationMs: 12,
            endedAt: Date.parse('2026-06-29T00:00:01.000Z'),
            error: 'fetch failed: web-proxy route origin was unreachable',
            httpStatus: null,
            id: 'execution-1',
            jobId: 'payment-products',
            path: '/api/cron/payment/products',
            response: null,
            schedule: '0 */12 * * *',
            scheduledAt: null,
            source: 'scheduled',
            startedAt: Date.parse('2026-06-29T00:00:00.000Z'),
            status: 'failed',
            triggerId: null,
          },
          updatedAt: Date.parse('2026-06-29T00:00:30.000Z'),
        })
      );

      const snapshot = readCronMonitoringSnapshot({
        now: Date.parse('2026-06-29T00:01:00.000Z'),
        paths,
      });

      expect(snapshot.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'last_execution_failed',
            detail: expect.stringContaining('web-proxy'),
            jobId: 'payment-products',
          }),
        ])
      );
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('emits an overdue managed job diagnostic', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cron-monitoring-managed-overdue-diagnostic-')
    );
    const paths = createCronMonitoringPaths(tempDir);

    try {
      writeCronConfig(paths.configFile);
      fs.mkdirSync(paths.runtimeDir, { recursive: true });
      fs.writeFileSync(
        paths.statusFile,
        JSON.stringify({
          updatedAt: Date.parse('2026-06-29T00:00:30.000Z'),
        })
      );

      const snapshot = readCronMonitoringSnapshot({
        now: Date.parse('2026-06-29T00:01:00.000Z'),
        paths,
      });
      const withDiagnostics = withManagedExternalCronDiagnostics(snapshot, {
        apps: [
          {
            appDisplayName: 'Demo app',
            appId: 'app-1',
            configured: true,
            enabled: true,
            generatedAt: '2026-06-29T00:01:00.000Z',
            jobs: [
              {
                enabled: true,
                failureStreak: 0,
                isOverdue: true,
                jobKey: 'sync-products',
                jobName: 'Sync products',
                lastExecution: null,
                nextRunAt: '2026-06-29T00:00:00.000Z',
                overdueReason: 'No execution recorded after scheduled time.',
                overdueSince: '2026-06-29T00:00:00.000Z',
                schedule: '* * * * *',
                scheduleDescription: 'Every minute',
                scheduleTimezone: 'UTC',
              },
            ],
            serverNow: '2026-06-29T00:01:00.000Z',
            workspaceId: 'workspace-1',
          },
        ],
        available: true,
        error: null,
        executions: [],
        generatedAt: '2026-06-29T00:01:00.000Z',
        serverNow: '2026-06-29T00:01:00.000Z',
      });

      expect(withDiagnostics.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'managed_external_overdue',
            count: 1,
            jobId: 'sync-products',
          }),
        ])
      );
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
