import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createResourceSamplingSummary,
  getBuildResources,
  parseObservabilityFilters,
  readObservabilityDeployments,
} from './observability';

const ORIGINAL_MONITORING_DIR = process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR;

afterEach(() => {
  if (ORIGINAL_MONITORING_DIR === undefined) {
    delete process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR;
    return;
  }

  process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = ORIGINAL_MONITORING_DIR;
});

describe('parseObservabilityFilters', () => {
  it('normalizes empty and all filters', () => {
    const filters = parseObservabilityFilters(
      new URLSearchParams({
        level: 'all',
        page: '0',
        pageSize: '999',
        source: 'all',
        timeframeHours: '-1',
      })
    );

    expect(filters).toMatchObject({
      level: null,
      page: 1,
      pageSize: 200,
      source: null,
      timeframeHours: 24,
    });
  });

  it('keeps searchable log filters', () => {
    const filters = parseObservabilityFilters(
      new URLSearchParams({
        level: 'error',
        page: '3',
        pageSize: '25',
        q: 'cron failure',
        since: '1710000000000',
        source: 'cron',
        status: '5xx',
        timeframeHours: '168',
        until: '2026-05-04T01:02:03.000Z',
      })
    );

    expect(filters).toMatchObject({
      level: 'error',
      page: 3,
      pageSize: 25,
      q: 'cron failure',
      since: 1710000000000,
      source: 'cron',
      status: '5xx',
      timeframeHours: 168,
      until: Date.parse('2026-05-04T01:02:03.000Z'),
    });
  });
});

describe('getBuildResources', () => {
  it('summarizes BuildKit resource usage separately from runtime containers', () => {
    const buildResources = getBuildResources({
      allContainers: [
        {
          containerId: 'buildkit-1',
          cpuPercent: 7.5,
          health: 'healthy',
          image: 'moby/buildkit:buildx-stable-1',
          isMonitored: false,
          memoryBytes: 512 * 1024 * 1024,
          name: 'tuturuuu-buildkit-1',
          ports: null,
          projectName: 'tuturuuu',
          runningFor: '2 minutes',
          rxBytes: 2048,
          serviceName: 'buildkit',
          status: 'Up 2 minutes',
          txBytes: 4096,
        },
        {
          containerId: 'web-1',
          cpuPercent: 1.5,
          health: 'healthy',
          image: 'tuturuuu-web',
          isMonitored: true,
          memoryBytes: 128 * 1024 * 1024,
          name: 'tuturuuu-web-1',
          ports: null,
          projectName: 'tuturuuu',
          runningFor: '10 minutes',
          rxBytes: 1024,
          serviceName: 'web',
          status: 'Up 10 minutes',
          txBytes: 1024,
        },
      ],
      containers: [],
      message: null,
      serviceHealth: [],
      state: 'live',
      totalCpuPercent: 9,
      totalMemoryBytes: 640 * 1024 * 1024,
      totalRxBytes: 3072,
      totalTxBytes: 5120,
    });

    expect(buildResources.activeBuilds).toHaveLength(0);
    expect(buildResources.containers).toHaveLength(1);
    expect(buildResources.containers[0]?.containerId).toBe('buildkit-1');
    expect(buildResources.state).toBe('live');
    expect(buildResources.totalCpuPercent).toBe(7.5);
    expect(buildResources.totalMemoryBytes).toBe(512 * 1024 * 1024);
    expect(buildResources.totalRxBytes).toBe(2048);
    expect(buildResources.totalTxBytes).toBe(4096);
  });

  it('reports watcher-active deployments even before BuildKit stats are sampled', () => {
    const buildResources = getBuildResources(
      {
        allContainers: [],
        containers: [],
        message: null,
        serviceHealth: [],
        state: 'idle',
        totalCpuPercent: 0,
        totalMemoryBytes: 0,
        totalRxBytes: 0,
        totalTxBytes: 0,
      },
      [
        {
          commitShortHash: 'abc123',
          commitSubject: 'Refresh production image',
          deploymentKind: 'standby-refresh',
          startedAt: Date.parse('2026-05-17T02:00:00.000Z'),
          status: 'building',
        },
        {
          commitShortHash: 'done123',
          commitSubject: 'Already deployed',
          deploymentKind: 'watcher',
          startedAt: Date.parse('2026-05-17T01:00:00.000Z'),
          status: 'successful',
        },
      ]
    );

    expect(buildResources.state).toBe('building');
    expect(buildResources.containers).toHaveLength(0);
    expect(buildResources.activeBuilds).toEqual([
      expect.objectContaining({
        commitShortHash: 'abc123',
        deploymentKind: 'standby-refresh',
        name: 'Refresh production image',
        status: 'building',
      }),
    ]);
    expect(buildResources.totalCpuPercent).toBe(0);
    expect(buildResources.totalMemoryBytes).toBe(0);
  });

  it('counts the watcher builder process while a deployment is building', () => {
    const buildResources = getBuildResources(
      {
        allContainers: [
          {
            containerId: 'watcher-1',
            cpuPercent: 9.1,
            health: 'healthy',
            image: 'tuturuuu-web-blue-green-watcher',
            isMonitored: false,
            memoryBytes: 350 * 1024 * 1024,
            name: 'tuturuuu-web-blue-green-watcher-1',
            ports: null,
            projectName: 'tuturuuu',
            runningFor: '42 minutes',
            rxBytes: 840 * 1024 * 1024,
            serviceName: 'web-blue-green-watcher',
            status: 'Up 42 minutes (healthy)',
            txBytes: 626 * 1024 * 1024,
          },
          {
            containerId: 'web-1',
            cpuPercent: 1.5,
            health: 'healthy',
            image: 'tuturuuu-web',
            isMonitored: true,
            memoryBytes: 128 * 1024 * 1024,
            name: 'tuturuuu-web-1',
            ports: null,
            projectName: 'tuturuuu',
            runningFor: '10 minutes',
            rxBytes: 1024,
            serviceName: 'web',
            status: 'Up 10 minutes',
            txBytes: 1024,
          },
        ],
        containers: [],
        message: null,
        serviceHealth: [],
        state: 'live',
        totalCpuPercent: 10.6,
        totalMemoryBytes: 478 * 1024 * 1024,
        totalRxBytes: 840 * 1024 * 1024 + 1024,
        totalTxBytes: 626 * 1024 * 1024 + 1024,
      },
      [
        {
          commitShortHash: 'abc123',
          commitSubject: 'Refresh production image',
          deploymentKind: 'recovery-bootstrap',
          startedAt: Date.parse('2026-05-17T02:00:00.000Z'),
          status: 'building',
        },
      ]
    );

    expect(buildResources.state).toBe('building');
    expect(buildResources.activeBuilds).toHaveLength(1);
    expect(buildResources.containers).toHaveLength(1);
    expect(buildResources.containers[0]?.containerId).toBe('watcher-1');
    expect(buildResources.totalCpuPercent).toBe(9.1);
    expect(buildResources.totalMemoryBytes).toBe(350 * 1024 * 1024);
    expect(buildResources.totalRxBytes).toBe(840 * 1024 * 1024);
    expect(buildResources.totalTxBytes).toBe(626 * 1024 * 1024);
  });
});

describe('createResourceSamplingSummary', () => {
  const now = Date.parse('2026-05-19T12:00:00.000Z');

  it('marks retained history gaps without counting the live bucket as persisted', () => {
    const summary = createResourceSamplingSummary({
      buckets: [
        {
          bucketStart: now - 180_000,
          cpuPercent: 10,
          memoryBytes: 128,
          rxBytes: 1,
          sampleCount: 1,
          txBytes: 2,
        },
        {
          bucketStart: now - 120_000,
          cpuPercent: null,
          memoryBytes: null,
          rxBytes: null,
          sampleCount: 0,
          txBytes: null,
        },
        {
          bucketStart: now - 60_000,
          cpuPercent: 12,
          hasLiveSample: true,
          memoryBytes: 256,
          rxBytes: 3,
          sampleCount: 0,
          txBytes: 4,
        },
      ],
      latestSampleAt: now - 120_000,
      now,
    });

    expect(summary.status).toBe('gapped');
    expect(summary.sampledBucketCount).toBe(1);
    expect(summary.gapBucketCount).toBe(1);
    expect(summary.latestSampleAgeMs).toBe(120_000);
  });

  it('marks retained history as stale when the latest persisted sample is old', () => {
    const summary = createResourceSamplingSummary({
      buckets: [
        {
          bucketStart: now - 600_000,
          cpuPercent: 10,
          memoryBytes: 128,
          rxBytes: 1,
          sampleCount: 1,
          txBytes: 2,
        },
        {
          bucketStart: now - 60_000,
          cpuPercent: 12,
          hasLiveSample: true,
          memoryBytes: 256,
          rxBytes: 3,
          sampleCount: 0,
          txBytes: 4,
        },
      ],
      latestSampleAt: now - 600_000,
      now,
    });

    expect(summary.status).toBe('stale');
    expect(summary.latestSampleAgeMs).toBe(600_000);
  });

  it('marks live-only data when no retained samples exist', () => {
    const summary = createResourceSamplingSummary({
      buckets: [
        {
          bucketStart: now,
          cpuPercent: 12,
          hasLiveSample: true,
          memoryBytes: 256,
          rxBytes: 3,
          sampleCount: 0,
          txBytes: 4,
        },
      ],
      latestSampleAt: null,
      now,
    });

    expect(summary.status).toBe('live-only');
    expect(summary.sampledBucketCount).toBe(0);
    expect(summary.gapBucketCount).toBe(0);
  });
});

describe('readObservabilityDeployments', () => {
  it('adds support build cache stats to deployment rows', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'observability-deployments-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'prod'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'watch'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'watch', 'blue-green-auto-deploy.history.json'),
        JSON.stringify([
          {
            activeColor: 'blue',
            buildDurationMs: 1234,
            commitHash: 'abc123456789',
            commitShortHash: 'abc1234',
            commitSubject: 'Deploy scoped web build',
            deploymentKind: 'promotion',
            deploymentStamp: 'deploy-abc1234',
            finishedAt: Date.UTC(2026, 4, 17, 9, 0, 1),
            imageTag: 'platform-web-cache:abc1234',
            stages: [
              {
                color: 'blue',
                id: 'web-promote',
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
            startedAt: Date.UTC(2026, 4, 17, 9, 0, 0),
            status: 'failed',
          },
        ])
      );
      fs.writeFileSync(
        path.join(tempDir, 'prod', 'target-state.json'),
        JSON.stringify({
          targets: {
            hive: {
              activeColor: 'green',
              commitShortHash: 'oldhive',
              health: 'blocked',
              lastPromotedAt: Date.UTC(2026, 4, 17, 8, 0, 0),
            },
            web: {
              activeColor: 'blue',
              commitShortHash: 'abc1234',
              health: 'healthy',
              lastPromotedAt: Date.UTC(2026, 4, 17, 9, 0, 1),
            },
          },
          version: 1,
        })
      );
      fs.writeFileSync(
        path.join(tempDir, 'prod', 'build-input-hashes.history.json'),
        JSON.stringify([
          {
            buildServices: ['web-blue', 'hive-blue'],
            commitHash: 'abc123456789',
            commitShortHash: 'abc1234',
            commitSubject: 'Deploy scoped web build',
            deploymentKind: 'promotion',
            deploymentStamp: 'deploy-abc1234',
            serviceHashes: {
              'hive-blue': 'hash-hive',
              'hive-realtime': 'hash-realtime',
              markitdown: 'hash-markitdown',
            },
            targetColor: 'blue',
            updatedAt: '2026-05-17T09:00:01.000Z',
          },
        ])
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const deployments = await readObservabilityDeployments({
        pageSize: 10,
        projectId: 'test-project',
      });

      expect(deployments.items[0]).toMatchObject({
        commitShortHash: 'abc1234',
        deploymentKind: 'promotion',
        imageTag: 'platform-web-cache:abc1234',
        stageSummary: {
          blockedTargets: ['hive'],
          failedStageCount: 1,
          promotedTargets: ['web'],
          totalStageCount: 2,
        },
        stages: [
          expect.objectContaining({ id: 'web-promote', status: 'succeeded' }),
          expect.objectContaining({ id: 'hive-migrate', status: 'failed' }),
        ],
        synthesizedStages: false,
        supportBuildCacheHits: 2,
        supportBuildServiceCount: 3,
        supportBuildServices: ['hive-blue'],
        targetStates: {
          hive: expect.objectContaining({
            activeColor: 'green',
            health: 'blocked',
          }),
          web: expect.objectContaining({
            activeColor: 'blue',
            health: 'healthy',
          }),
        },
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('infers completed stage status for modern watcher rows missing persisted stages', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'observability-inferred-deployment-stages-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'prod'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'watch'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'watch', 'blue-green-auto-deploy.history.json'),
        JSON.stringify([
          {
            activeColor: 'green',
            buildDurationMs: 1234,
            commitHash: 'abc123456789',
            commitShortHash: 'abc1234',
            commitSubject: 'Deploy without stage handoff',
            deploymentKind: 'promotion',
            deploymentStamp: 'deploy-abc1234',
            finishedAt: Date.UTC(2026, 4, 17, 9, 0, 1),
            imageTag: 'platform-web-cache:abc1234',
            startedAt: Date.UTC(2026, 4, 17, 9, 0, 0),
            status: 'successful',
          },
        ])
      );
      fs.writeFileSync(
        path.join(tempDir, 'prod', 'build-input-hashes.history.json'),
        JSON.stringify([
          {
            buildServices: [
              'web-green',
              'hive-green',
              'hive-realtime',
              'markitdown',
            ],
            commitHash: 'abc123456789',
            commitShortHash: 'abc1234',
            commitSubject: 'Deploy without stage handoff',
            deploymentKind: 'promotion',
            deploymentStamp: 'deploy-abc1234',
            serviceHashes: {
              'hive-green': 'hash-hive',
              'hive-realtime': 'hash-realtime',
              markitdown: 'hash-markitdown',
              'web-cron-runner': 'hash-cron',
            },
            targetColor: 'green',
            updatedAt: '2026-05-17T09:00:01.000Z',
          },
        ])
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const deployments = await readObservabilityDeployments({
        pageSize: 10,
        projectId: 'test-project',
      });

      expect(deployments.items[0]).toMatchObject({
        commitShortHash: 'abc1234',
        stageSummary: {
          failedStageCount: 0,
          runningStageCount: 0,
          totalStageCount: 6,
        },
        stages: [
          expect.objectContaining({ id: 'web-build', status: 'succeeded' }),
          expect.objectContaining({ id: 'web-promote', status: 'succeeded' }),
          expect.objectContaining({
            id: 'hive-migrate',
            status: 'succeeded',
          }),
          expect.objectContaining({
            id: 'hive-promote',
            status: 'succeeded',
          }),
          expect.objectContaining({
            id: 'support-refresh',
            status: 'succeeded',
          }),
          expect.objectContaining({ id: 'proxy-reload', status: 'succeeded' }),
        ],
        synthesizedStages: true,
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('synthesizes a running stage for active watcher deployments', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'observability-active-deployment-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'prod'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'watch'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'watch', 'blue-green-auto-deploy.history.json'),
        JSON.stringify([
          {
            activeColor: 'green',
            commitHash: 'def123456789',
            commitShortHash: 'def1234',
            commitSubject: 'Build current deployment',
            deploymentKind: 'promotion',
            startedAt: Date.UTC(2026, 4, 17, 10, 0, 0),
            status: 'building',
          },
        ])
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const deployments = await readObservabilityDeployments({
        pageSize: 10,
        projectId: 'test-project',
      });

      expect(deployments.items[0]).toMatchObject({
        commitShortHash: 'def1234',
        stageSummary: {
          runningStageCount: 1,
          totalStageCount: 1,
        },
        stages: [
          expect.objectContaining({
            id: 'web-build',
            status: 'running',
            target: 'web',
          }),
        ],
        status: 'building',
        synthesizedStages: true,
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
