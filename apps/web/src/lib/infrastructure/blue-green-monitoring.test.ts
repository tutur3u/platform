import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readBlueGreenMonitoringRequestArchive,
  readBlueGreenMonitoringSnapshot,
} from './blue-green-monitoring';

const ORIGINAL_MONITORING_DIR = process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR;

describe('readBlueGreenMonitoringSnapshot', () => {
  afterEach(() => {
    if (ORIGINAL_MONITORING_DIR === undefined) {
      delete process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR;
      return;
    }

    process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = ORIGINAL_MONITORING_DIR;
  });

  it('derives docker aggregate totals from all running containers', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-monitoring-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'watch'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'watch', 'blue-green-auto-deploy.status.json'),
        JSON.stringify({
          currentBlueGreen: { state: 'serving' },
          dockerResources: {
            allContainers: [
              {
                containerId: 'web',
                cpuPercent: 1.25,
                health: 'healthy',
                memoryBytes: 128,
                name: 'platform-web-1',
              },
              {
                containerId: 'redis',
                cpuPercent: 0.75,
                health: 'healthy',
                memoryBytes: 256,
                name: 'platform-redis-1',
              },
            ],
            serviceHealth: [
              {
                containerId: 'redis',
                health: 'healthy',
                name: 'platform-redis-1',
                serviceName: 'redis',
              },
            ],
            totalCpuPercent: 0,
            totalMemoryBytes: 0,
          },
          intervalMs: 1000,
          updatedAt: 1000,
        })
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const snapshot = readBlueGreenMonitoringSnapshot({ now: 2000 });

      expect(snapshot.dockerResources.totalCpuPercent).toBe(2);
      expect(snapshot.dockerResources.totalMemoryBytes).toBe(384);
      expect(snapshot.dockerResources.allContainers).toHaveLength(2);
      expect(snapshot.dockerResources.serviceHealth[0]?.serviceName).toBe(
        'redis'
      );
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('redacts deployment lock tokens from watcher results', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-monitoring-lock-token-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'watch'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'watch', 'blue-green-auto-deploy.status.json'),
        JSON.stringify({
          intervalMs: 1000,
          lastResult: {
            activeDeployment: {
              command: 'bun serve:web:docker:bg',
              lockToken: 'secret-lock-token',
              ownerPid: 9876,
            },
            lockToken: 'outer-secret-lock-token',
            status: 'deployment-active',
          },
          updatedAt: 1000,
        })
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const snapshot = readBlueGreenMonitoringSnapshot({ now: 2000 });

      expect(snapshot.watcher.lastResult).toEqual({
        activeDeployment: {
          command: 'bun serve:web:docker:bg',
          ownerPid: 9876,
        },
        status: 'deployment-active',
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('treats running containers without Docker healthchecks as healthy', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-monitoring-runtime-health-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'watch'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'watch', 'blue-green-auto-deploy.status.json'),
        JSON.stringify({
          dockerResources: {
            allContainers: [
              {
                containerId: 'legacy-php',
                health: 'none',
                name: 'pktm-legacy-php',
                status: 'Up 4 minutes',
              },
              {
                containerId: 'legacy-db',
                health: 'healthy',
                name: 'pktm-legacy-db',
                status: 'Up 5 minutes (healthy)',
              },
            ],
            serviceHealth: [],
          },
          intervalMs: 1000,
          updatedAt: 1000,
        })
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const snapshot = readBlueGreenMonitoringSnapshot({ now: 2000 });

      expect(snapshot.dockerResources.allContainers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            containerId: 'legacy-php',
            health: 'healthy',
          }),
          expect.objectContaining({
            containerId: 'legacy-db',
            health: 'healthy',
          }),
        ])
      );
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('reads the active deployment pin from the watcher control directory', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-monitoring-pin-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'watch', 'control'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(
          tempDir,
          'watch',
          'control',
          'blue-green-deployment-pin.json'
        ),
        JSON.stringify({
          commitHash: 'old123456789',
          commitShortHash: 'old1234',
          commitSubject: 'Known good deployment',
          deploymentStamp: 'deploy-2026-04-20T10-00-00Z',
          kind: 'deployment-pin',
          requestedAt: '2026-04-23T10:00:00.000Z',
          requestedBy: 'user-1',
          requestedByEmail: 'ops@platform.test',
        })
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const snapshot = readBlueGreenMonitoringSnapshot({ now: 2000 });

      expect(snapshot.control.deploymentPin).toMatchObject({
        commitHash: 'old123456789',
        kind: 'deployment-pin',
        requestedBy: 'user-1',
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('reads a queued instant rollout request from the watcher control directory', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-monitoring-instant-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'watch', 'control'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(
          tempDir,
          'watch',
          'control',
          'blue-green-instant-rollout.request.json'
        ),
        JSON.stringify({
          kind: 'sync-standby',
          requestedAt: '2026-04-25T06:00:00.000Z',
          requestedBy: 'user-1',
          requestedByEmail: 'ops@platform.test',
        })
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const snapshot = readBlueGreenMonitoringSnapshot({ now: 2000 });

      expect(snapshot.control.instantRolloutRequest).toMatchObject({
        kind: 'sync-standby',
        requestedAt: '2026-04-25T06:00:00.000Z',
        requestedBy: 'user-1',
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('reads Docker recovery settings from the watcher control directory', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-monitoring-recovery-settings-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'watch', 'control'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(
          tempDir,
          'watch',
          'control',
          'blue-green-docker-recovery-settings.json'
        ),
        JSON.stringify({
          dockerRecoveryPollMs: 1000,
          dockerRecoveryTimeoutMs: null,
          dockerRestartAfterMs: 5000,
          dockerRestartCommand: ['service', 'docker', 'restart'],
          dockerRestartCooldownMs: 60_000,
          dockerRestartDisabled: false,
          emailAlertCooldownMs: 900_000,
          emailAlertRecipients: ['ops@platform.test'],
          emailAlertsEnabled: true,
          kind: 'docker-recovery-settings',
          postRestartCommandTimeoutMs: 120_000,
          postRestartCommands: [
            {
              args: ['compose', 'up', '-d'],
              command: 'docker',
              cwd: '/srv/zeus',
            },
          ],
          updatedAt: '2026-05-17T09:30:00.000Z',
          updatedBy: 'user-1',
          updatedByEmail: 'ops@platform.test',
        })
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const snapshot = readBlueGreenMonitoringSnapshot({ now: 2000 });

      expect(snapshot.control.dockerRecoverySettings).toMatchObject({
        dockerRestartAfterMs: 5000,
        dockerRestartCommand: null,
        postRestartCommands: [],
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('exposes the latest cached recoverable deployments from history', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-monitoring-cache-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'watch'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'watch', 'blue-green-auto-deploy.history.json'),
        JSON.stringify([
          {
            commitHash: 'latest-cached',
            commitShortHash: 'latest',
            commitSubject: 'Latest cached deploy',
            finishedAt: 4000,
            imageTag: 'platform-web-cache:latest',
            status: 'successful',
          },
          {
            commitHash: 'failed-cached',
            commitShortHash: 'failed',
            finishedAt: 3500,
            imageTag: 'platform-web-cache:failed',
            status: 'failed',
          },
          {
            commitHash: 'uncached-success',
            commitShortHash: 'uncached',
            finishedAt: 3000,
            status: 'successful',
          },
          {
            commitHash: 'middle-cached',
            commitShortHash: 'middle',
            commitSubject: 'Middle cached deploy',
            finishedAt: 2000,
            imageTag: 'platform-web-cache:middle',
            status: 'successful',
          },
          {
            commitHash: 'old-cached',
            commitShortHash: 'old',
            commitSubject: 'Old cached deploy',
            finishedAt: 1000,
            imageTag: 'platform-web-cache:old',
            status: 'successful',
          },
          {
            commitHash: 'older-cached',
            commitShortHash: 'older',
            commitSubject: 'Older cached deploy',
            finishedAt: 500,
            imageTag: 'platform-web-cache:older',
            status: 'successful',
          },
        ])
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const snapshot = readBlueGreenMonitoringSnapshot({ now: 5000 });

      expect(
        snapshot.recoveryCache.deployments.map((deployment) => ({
          commitHash: deployment.commitHash,
          imageTag: deployment.imageTag,
        }))
      ).toEqual([
        {
          commitHash: 'latest-cached',
          imageTag: 'platform-web-cache:latest',
        },
        {
          commitHash: 'middle-cached',
          imageTag: 'platform-web-cache:middle',
        },
        {
          commitHash: 'old-cached',
          imageTag: 'platform-web-cache:old',
        },
      ]);
      expect(snapshot.recoveryCache.limit).toBe(3);
      expect(snapshot.recoveryCache.total).toBe(4);
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('exposes support build input hash cache history', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-monitoring-build-cache-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'prod'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'prod', 'build-input-hashes.json'),
        JSON.stringify({
          services: {
            'hive-blue': 'hash-hive',
            'hive-realtime': 'hash-realtime',
          },
          updatedAt: '2026-05-17T10:00:00.000Z',
          version: 1,
        })
      );
      fs.writeFileSync(
        path.join(tempDir, 'prod', 'build-input-hashes.history.json'),
        JSON.stringify([
          {
            buildServices: ['web-blue', 'hive-blue'],
            commitHash: 'bbb222',
            commitShortHash: 'bbb222',
            commitSubject: 'Build web and Hive',
            deploymentKind: 'standby-refresh',
            deploymentStamp: 'deploy-bbb222',
            serviceHashes: {
              'hive-blue': 'hash-hive',
              'hive-realtime': 'hash-realtime',
            },
            targetColor: 'blue',
            updatedAt: '2026-05-17T10:00:00.000Z',
          },
        ])
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const snapshot = readBlueGreenMonitoringSnapshot({ now: 5000 });

      expect(snapshot.buildCache.current).toEqual({
        'hive-blue': 'hash-hive',
        'hive-realtime': 'hash-realtime',
      });
      expect(snapshot.buildCache.history[0]).toMatchObject({
        buildServices: ['web-blue', 'hive-blue'],
        commitShortHash: 'bbb222',
        deploymentKind: 'standby-refresh',
        deploymentStamp: 'deploy-bbb222',
      });
      expect(snapshot.buildCache.total).toBe(1);
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('exposes per-target runtime state and deployment stages', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-monitoring-stages-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'prod'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'watch'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'prod', 'active-color'), 'green\n');
      fs.writeFileSync(
        path.join(tempDir, 'prod', 'target-state.json'),
        JSON.stringify({
          targets: {
            hive: {
              activeColor: 'blue',
              commitShortHash: 'oldhive',
              health: 'blocked',
              lastPromotedAt: 1000,
              standbyColor: 'green',
            },
            web: {
              activeColor: 'green',
              commitShortHash: 'newweb',
              health: 'healthy',
              lastPromotedAt: 2000,
              standbyColor: 'blue',
            },
          },
          version: 1,
        })
      );
      fs.writeFileSync(
        path.join(tempDir, 'watch', 'blue-green-auto-deploy.history.json'),
        JSON.stringify([
          {
            activeColor: 'green',
            commitHash: 'commit-green',
            commitShortHash: 'newweb',
            deploymentStamp: 'deploy-green',
            stages: [
              {
                color: 'green',
                finishedAt: 2000,
                id: 'web-promote',
                startedAt: 1000,
                status: 'succeeded',
                target: 'web',
              },
              {
                failureReason: 'hive migration failed',
                id: 'hive-migrate',
                status: 'failed',
                target: 'hive',
              },
            ],
            status: 'failed',
          },
        ])
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const snapshot = readBlueGreenMonitoringSnapshot({ now: 3000 });
      const runtime = snapshot.runtime as typeof snapshot.runtime & {
        targets?: Record<string, { activeColor: string | null }>;
      };
      const deployment = snapshot
        .deployments[0] as (typeof snapshot.deployments)[number] & {
        stages?: Array<{ id: string; status: string; target: string }>;
      };

      expect(runtime.targets?.web?.activeColor).toBe('green');
      expect(runtime.targets?.hive?.activeColor).toBe('blue');
      expect(deployment.stages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'web-promote',
            status: 'succeeded',
            target: 'web',
          }),
          expect.objectContaining({
            id: 'hive-migrate',
            status: 'failed',
            target: 'hive',
          }),
        ])
      );
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});

describe('readBlueGreenMonitoringRequestArchive', () => {
  afterEach(() => {
    if (ORIGINAL_MONITORING_DIR === undefined) {
      delete process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR;
      return;
    }

    process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = ORIGINAL_MONITORING_DIR;
  });

  it('calculates request analytics globally across the selected timeframe', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-monitoring-requests-')
    );
    const now = Date.UTC(2026, 3, 25, 12, 0, 0);

    try {
      const requestLogDir = path.join(
        tempDir,
        'watch',
        'blue-green-request-logs'
      );
      fs.mkdirSync(requestLogDir, { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'watch', 'blue-green-request-telemetry.state.json'),
        JSON.stringify({
          chunks: [
            {
              count: 4,
              file: 'requests-1.jsonl',
              firstRequestAt: now - 8 * 24 * 60 * 60 * 1000,
              lastRequestAt: now - 60_000,
            },
          ],
          currentChunkCount: 4,
          currentChunkFile: 'requests-1.jsonl',
          totalRecords: 4,
        })
      );
      fs.writeFileSync(
        path.join(requestLogDir, 'requests-1.jsonl'),
        [
          {
            host: 'tuturuuu.com',
            isInternal: false,
            method: 'GET',
            path: '/old',
            requestTimeMs: 10,
            status: 200,
            time: now - 8 * 24 * 60 * 60 * 1000,
          },
          {
            host: 'tuturuuu.com',
            isInternal: false,
            method: 'GET',
            path: '/games?_rsc=abc',
            requestTimeMs: 100,
            status: 200,
            time: now - 60_000,
          },
          {
            host: 'tuturuuu.com',
            isInternal: false,
            method: 'POST',
            path: '/games',
            requestTimeMs: 300,
            status: 500,
            time: now - 30_000,
          },
          {
            host: '127.0.0.1',
            isInternal: true,
            method: 'GET',
            path: '/__platform/drain-status',
            requestTimeMs: 2,
            status: 200,
            time: now - 10_000,
          },
        ]
          .map((entry) => JSON.stringify(entry))
          .join('\n')
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const archive = readBlueGreenMonitoringRequestArchive({
        now,
        page: 1,
        pageSize: 2,
        timeframeDays: 7,
      });

      expect(archive.items).toHaveLength(2);
      expect(archive.total).toBe(3);
      expect(archive.analytics.requestCount).toBe(3);
      expect(archive.analytics.retainedRequestCount).toBe(4);
      expect(archive.analytics.errorRequestCount).toBe(1);
      expect(archive.analytics.rscRequestCount).toBe(1);
      expect(archive.analytics.distinctRoutes).toBe(2);
      expect(archive.analytics.topRoutes[0]).toMatchObject({
        errorCount: 1,
        pathname: '/games',
        requestCount: 2,
        rscCount: 1,
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('filters requests before pagination and attaches scoped watcher logs', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-monitoring-request-filters-')
    );
    const now = Date.UTC(2026, 3, 25, 12, 0, 0);

    try {
      const watchDir = path.join(tempDir, 'watch');
      const requestLogDir = path.join(watchDir, 'blue-green-request-logs');
      fs.mkdirSync(requestLogDir, { recursive: true });
      fs.writeFileSync(
        path.join(watchDir, 'blue-green-request-telemetry.state.json'),
        JSON.stringify({
          chunks: [
            {
              count: 3,
              file: 'requests-1.jsonl',
              firstRequestAt: now - 90_000,
              lastRequestAt: now - 10_000,
            },
          ],
          currentChunkCount: 3,
          currentChunkFile: 'requests-1.jsonl',
          totalRecords: 3,
        })
      );
      fs.writeFileSync(
        path.join(watchDir, 'blue-green-auto-deploy.logs.json'),
        JSON.stringify([
          {
            deploymentStamp: 'deploy-b',
            level: 'error',
            message: 'API route threw while rendering invoices',
            time: now - 9_000,
          },
          {
            deploymentStamp: 'deploy-a',
            level: 'info',
            message: 'Unrelated request context',
            time: now - 80_000,
          },
        ])
      );
      fs.writeFileSync(
        path.join(requestLogDir, 'requests-1.jsonl'),
        [
          {
            deploymentStamp: 'deploy-a',
            host: 'tuturuuu.com',
            isInternal: false,
            method: 'GET',
            path: '/ok',
            requestTimeMs: 20,
            status: 200,
            time: now - 90_000,
          },
          {
            consoleLogs: [
              {
                containerId: 'green-123',
                deploymentColor: 'green',
                level: 'error',
                message: 'Error fetching transaction export tags',
                source: 'route',
                time: now - 9_500,
              },
            ],
            deploymentStamp: 'deploy-b',
            host: 'tuturuuu.com',
            isInternal: false,
            method: 'GET',
            path: '/api/v1/invoices?_rsc=abc',
            requestTimeMs: 320,
            status: 500,
            time: now - 10_000,
          },
          {
            deploymentStamp: 'deploy-b',
            host: '127.0.0.1',
            isInternal: true,
            method: 'GET',
            path: '/__platform/drain-status',
            requestTimeMs: 4,
            status: 500,
            time: now - 8_000,
          },
        ]
          .map((entry) => JSON.stringify(entry))
          .join('\n')
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const archive = readBlueGreenMonitoringRequestArchive({
        now,
        page: 1,
        pageSize: 1,
        q: 'invoices',
        render: 'rsc',
        status: '5xx',
        timeframeDays: 7,
        traffic: 'external',
      });

      expect(archive.total).toBe(1);
      expect(archive.items).toHaveLength(1);
      expect(archive.items[0]).toMatchObject({
        consoleLogs: [
          expect.objectContaining({
            message: 'Error fetching transaction export tags',
            source: 'route',
          }),
        ],
        path: '/api/v1/invoices?_rsc=abc',
      });
      expect(archive.items[0]?.relatedLogs).toContainEqual(
        expect.objectContaining({
          message: 'API route threw while rendering invoices',
        })
      );
      expect(archive.analytics.requestCount).toBe(1);
      expect(archive.analytics.topRoutes[0]).toMatchObject({
        pathname: '/api/v1/invoices',
        requestCount: 1,
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
