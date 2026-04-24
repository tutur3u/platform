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
});
