import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readBlueGreenMonitoringSnapshot } from './blue-green-monitoring';

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
});
