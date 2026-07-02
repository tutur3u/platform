import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createResourceSamplingSummary,
  getBuildResources,
  parseObservabilityFilters,
  readObservabilityDeployments,
  readObservabilityLogs,
  readObservabilityRequests,
} from './observability';

const ORIGINAL_MONITORING_DIR = process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR;
const ORIGINAL_LOG_DRAIN_ENABLED = process.env.PLATFORM_LOG_DRAIN_ENABLED;
const logDrainMocks = vi.hoisted(() => ({
  ensureLogDrainSchema: vi.fn(),
  getLogDrainSqlClient: vi.fn(),
  pruneOldLogDrainRecords: vi.fn(),
  queries: [] as { text: string; values: unknown[] }[],
}));

vi.mock('./log-drain', () => ({
  ensureLogDrainSchema: (...args: unknown[]) =>
    logDrainMocks.ensureLogDrainSchema(...args),
  getLogDrainSqlClient: (...args: unknown[]) =>
    logDrainMocks.getLogDrainSqlClient(...args),
  pruneOldLogDrainRecords: (...args: unknown[]) =>
    logDrainMocks.pruneOldLogDrainRecords(...args),
}));

function createMockLogDrainSql(results: unknown[][] = []) {
  return vi.fn(
    (first: TemplateStringsArray | unknown, ...values: unknown[]) => {
      if (Array.isArray(first) && 'raw' in first) {
        logDrainMocks.queries.push({
          text: Array.from(first).join('?'),
          values,
        });
        return Promise.resolve(results.shift() ?? []);
      }

      return first;
    }
  );
}

function getLogDrainQuery(match: string) {
  const query = logDrainMocks.queries.find(({ text }) => text.includes(match));
  expect(query).toBeDefined();
  return query as { text: string; values: unknown[] };
}

beforeEach(() => {
  logDrainMocks.queries.length = 0;
  logDrainMocks.ensureLogDrainSchema.mockReset();
  logDrainMocks.ensureLogDrainSchema.mockResolvedValue(undefined);
  logDrainMocks.getLogDrainSqlClient.mockReset();
  logDrainMocks.getLogDrainSqlClient.mockReturnValue(null);
  logDrainMocks.pruneOldLogDrainRecords.mockReset();
  logDrainMocks.pruneOldLogDrainRecords.mockResolvedValue(undefined);
});

afterEach(() => {
  if (ORIGINAL_MONITORING_DIR === undefined) {
    delete process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR;
  } else {
    process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = ORIGINAL_MONITORING_DIR;
  }

  if (ORIGINAL_LOG_DRAIN_ENABLED === undefined) {
    delete process.env.PLATFORM_LOG_DRAIN_ENABLED;
  } else {
    process.env.PLATFORM_LOG_DRAIN_ENABLED = ORIGINAL_LOG_DRAIN_ENABLED;
  }
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
        deploymentStamp: 'deploy-2026-05-31',
        requestId: 'req_123',
        route: '/api/cron/infrastructure/sample-resources?debug=1',
        since: '1710000000000',
        source: 'cron',
        status: '5xx',
        timeframeHours: '168',
        until: '2026-05-04T01:02:03.000Z',
        user: 'operator@example.com',
      })
    );

    expect(filters).toMatchObject({
      level: 'error',
      page: 3,
      pageSize: 25,
      q: 'cron failure',
      deploymentStamp: 'deploy-2026-05-31',
      requestId: 'req_123',
      route: '/api/cron/infrastructure/sample-resources?debug=1',
      since: 1710000000000,
      source: 'cron',
      status: '5xx',
      timeframeHours: 168,
      until: Date.parse('2026-05-04T01:02:03.000Z'),
      user: 'operator@example.com',
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

describe('readObservabilityLogs', () => {
  it('applies cursor bounds inside the capped log-drain log query', async () => {
    const since = Date.parse('2026-05-04T01:00:00.000Z');
    const until = Date.parse('2026-05-04T02:00:00.000Z');
    logDrainMocks.getLogDrainSqlClient.mockReturnValue(
      createMockLogDrainSql([[]])
    );

    await readObservabilityLogs({
      pageSize: 10,
      since,
      timeframeHours: 24,
      until,
    });

    const query = getLogDrainQuery('FROM log_events');
    expect(query.text.indexOf('log_events.created_at >')).toBeLessThan(
      query.text.indexOf('ORDER BY log_events.created_at DESC')
    );
    expect(query.text.indexOf('log_events.created_at <=')).toBeLessThan(
      query.text.indexOf('LIMIT')
    );
    expect(query.values).toEqual(
      expect.arrayContaining([
        new Date(since).toISOString(),
        new Date(until).toISOString(),
      ])
    );
  });

  it('exposes coalesced route and authenticated user context from log-drain rows', async () => {
    logDrainMocks.getLogDrainSqlClient.mockReturnValue(
      createMockLogDrainSql([
        [
          {
            created_at: new Date('2026-05-04T01:30:00.000Z'),
            deployment_color: 'green',
            deployment_stamp: 'deploy-user',
            duration_ms: 42,
            error_name: 'Error',
            error_stack: 'Error: failed',
            id: 'event-user',
            ip_address: '203.0.113.10',
            level: 'error',
            message: 'Route failed for operator',
            metadata: { route: '/api/from-request' },
            request_id: 'req-user',
            route: '/api/from-request',
            source: 'api',
            status: 500,
            user_agent: 'vitest',
            user_email: 'operator@example.com',
            user_id: 'user-123',
          },
        ],
      ])
    );

    const logs = await readObservabilityLogs({
      pageSize: 10,
      q: 'operator@example.com',
      route: '/api/from-request',
      timeframeHours: 24,
      user: 'operator',
    });

    expect(logs.total).toBe(1);
    expect(logs.items[0]).toMatchObject({
      requestId: 'req-user',
      route: '/api/from-request',
      userEmail: 'operator@example.com',
      userId: 'user-123',
    });
    expect(logs.items[0]?.events[0]).toMatchObject({
      route: '/api/from-request',
      userEmail: 'operator@example.com',
      userId: 'user-123',
    });
    expect(logs.facets.users).toContainEqual(
      expect.objectContaining({
        count: 1,
        value: 'operator@example.com',
      })
    );
  });

  it('caps embedded grouped events while preserving total event count', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'observability-capped-logs-')
    );
    const now = Date.now();

    try {
      const watchDir = path.join(tempDir, 'watch');
      const requestLogDir = path.join(watchDir, 'blue-green-request-logs');
      fs.mkdirSync(requestLogDir, { recursive: true });
      fs.writeFileSync(
        path.join(watchDir, 'blue-green-request-telemetry.state.json'),
        JSON.stringify({
          chunks: [
            {
              count: 1,
              file: 'requests-1.jsonl',
              firstRequestAt: now - 20_000,
              lastRequestAt: now - 20_000,
            },
          ],
          currentChunkCount: 1,
          currentChunkFile: 'requests-1.jsonl',
          totalRecords: 1,
        })
      );
      fs.writeFileSync(
        path.join(requestLogDir, 'requests-1.jsonl'),
        JSON.stringify({
          consoleLogs: Array.from({ length: 150 }, (_, index) => ({
            level: 'info',
            message: `event-${index}`,
            source: 'route',
            time: now - 20_000 + index,
          })),
          deploymentStamp: 'deploy-capped',
          host: 'tuturuuu.com',
          isInternal: false,
          method: 'GET',
          path: '/api/cron/infrastructure/sample-resources',
          requestTimeMs: 24,
          status: 200,
          time: now - 20_000,
        })
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;
      process.env.PLATFORM_LOG_DRAIN_ENABLED = 'false';

      const logs = await readObservabilityLogs({
        pageSize: 1,
        route: '/api/cron/infrastructure/sample-resources',
        timeframeHours: 1,
      });

      expect(logs.total).toBe(1);
      expect(logs.items[0]?.eventCount).toBe(150);
      expect(logs.items[0]?.events).toHaveLength(100);
      expect(logs.items[0]?.events[0]?.message).toBe('event-50');
      expect(logs.items[0]?.events.at(-1)?.message).toBe('event-149');
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('groups legacy console logs by request id and exposes route/status facets', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'observability-logs-')
    );
    const now = Date.now();

    try {
      const watchDir = path.join(tempDir, 'watch');
      const requestLogDir = path.join(watchDir, 'blue-green-request-logs');
      fs.mkdirSync(requestLogDir, { recursive: true });
      fs.writeFileSync(
        path.join(watchDir, 'blue-green-request-telemetry.state.json'),
        JSON.stringify({
          chunks: [
            {
              count: 2,
              file: 'requests-1.jsonl',
              firstRequestAt: now - 20_000,
              lastRequestAt: now - 10_000,
            },
          ],
          currentChunkCount: 2,
          currentChunkFile: 'requests-1.jsonl',
          totalRecords: 2,
        })
      );
      fs.writeFileSync(
        path.join(requestLogDir, 'requests-1.jsonl'),
        [
          {
            consoleLogs: [
              {
                level: 'info',
                message: 'Sampled infrastructure resources {',
                source: 'route',
                time: now - 19_000,
              },
              {
                level: 'info',
                message: 'activeBuilds: 0,',
                source: 'route',
                time: now - 18_000,
              },
              {
                level: 'info',
                message: 'buildState: idle',
                source: 'route',
                time: now - 17_000,
              },
            ],
            deploymentStamp: 'deploy-sample',
            host: 'tuturuuu.com',
            isInternal: false,
            method: 'GET',
            path: '/api/cron/infrastructure/sample-resources?debug=1',
            requestTimeMs: 24,
            status: 200,
            time: now - 20_000,
          },
          {
            consoleLogs: [
              {
                level: 'warn',
                message: 'Health route slow',
                source: 'route',
                time: now - 9_000,
              },
            ],
            host: 'tuturuuu.com',
            isInternal: false,
            method: 'GET',
            path: '/api/health',
            requestTimeMs: 50,
            status: 503,
            time: now - 10_000,
          },
        ]
          .map((entry) => JSON.stringify(entry))
          .join('\n')
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;
      process.env.PLATFORM_LOG_DRAIN_ENABLED = 'false';

      const logs = await readObservabilityLogs({
        pageSize: 10,
        route: '/api/cron/infrastructure/sample-resources',
        status: '2xx',
        timeframeHours: 1,
      });

      expect(logs.total).toBe(1);
      expect(logs.items[0]).toMatchObject({
        deploymentStamp: 'deploy-sample',
        eventCount: 3,
        message: 'Sampled infrastructure resources {',
        route: '/api/cron/infrastructure/sample-resources?debug=1',
        status: 200,
      });
      expect(logs.items[0]?.events.map((event) => event.message)).toEqual([
        'Sampled infrastructure resources {',
        'activeBuilds: 0,',
        'buildState: idle',
      ]);
      expect(logs.facets.routes).toContainEqual(
        expect.objectContaining({
          count: 3,
          value: '/api/cron/infrastructure/sample-resources',
        })
      );
      expect(logs.facets.statuses).toContainEqual(
        expect.objectContaining({ count: 3, value: '2xx' })
      );
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('uses fallback grouping for standalone watcher events', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'observability-fallback-logs-')
    );
    const now = Math.floor(Date.now() / 60_000) * 60_000 - 15_000;

    try {
      fs.mkdirSync(path.join(tempDir, 'watch'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'watch', 'blue-green-auto-deploy.logs.json'),
        JSON.stringify([
          {
            deploymentStamp: 'deploy-standalone',
            level: 'info',
            message: 'Watcher sampled resources {',
            time: now - 30_000,
          },
          {
            deploymentStamp: 'deploy-standalone',
            level: 'info',
            message: 'buildState: idle',
            time: now - 29_000,
          },
        ])
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;
      process.env.PLATFORM_LOG_DRAIN_ENABLED = 'false';

      const logs = await readObservabilityLogs({
        pageSize: 10,
        source: 'server',
        timeframeHours: 1,
      });

      expect(logs.total).toBe(1);
      expect(logs.items[0]).toMatchObject({
        deploymentStamp: 'deploy-standalone',
        eventCount: 2,
        message: 'Watcher sampled resources {',
        requestId: null,
        source: 'server',
      });
      expect(logs.items[0]?.events.map((event) => event.message)).toEqual([
        'Watcher sampled resources {',
        'buildState: idle',
      ]);
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});

describe('readObservabilityRequests', () => {
  it('applies cursor bounds inside the capped log-drain request query', async () => {
    const since = Date.parse('2026-05-04T01:00:00.000Z');
    const until = Date.parse('2026-05-04T02:00:00.000Z');
    logDrainMocks.getLogDrainSqlClient.mockReturnValue(
      createMockLogDrainSql([
        [
          {
            cron_job_id: null,
            deployment_color: 'blue',
            deployment_stamp: 'deploy-window',
            duration_ms: 42,
            ended_at: new Date('2026-05-04T01:30:01.000Z'),
            error_message: null,
            id: 'req-window',
            ip_address: '203.0.113.10',
            log_count: 0,
            method: 'GET',
            path: '/api/window',
            source: 'api',
            started_at: new Date('2026-05-04T01:30:00.000Z'),
            status: 200,
            user_agent: 'vitest',
            user_email: 'operator@example.com',
            user_id: 'user-123',
          },
        ],
        [],
      ])
    );

    const requests = await readObservabilityRequests({
      pageSize: 10,
      since,
      timeframeHours: 24,
      until,
    });

    const query = getLogDrainQuery('FROM requests');
    expect(query.text.indexOf('requests.started_at >')).toBeLessThan(
      query.text.indexOf('ORDER BY requests.started_at DESC')
    );
    expect(query.text.indexOf('requests.started_at <=')).toBeLessThan(
      query.text.indexOf('LIMIT')
    );
    expect(query.values).toEqual(
      expect.arrayContaining([
        new Date(since).toISOString(),
        new Date(until).toISOString(),
      ])
    );
    expect(requests.items[0]?.id).toBe('req-window');
    expect(requests.items[0]).toMatchObject({
      userEmail: 'operator@example.com',
      userId: 'user-123',
    });
  });

  it('keeps frozen legacy request cursors from being evicted by newer floods', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'observability-legacy-request-cursor-')
    );
    const now = Date.now();
    const until = now - 30_000;

    try {
      const watchDir = path.join(tempDir, 'watch');
      const requestLogDir = path.join(watchDir, 'blue-green-request-logs');
      fs.mkdirSync(requestLogDir, { recursive: true });
      const inWindowRequests = [
        {
          host: 'tuturuuu.com',
          isInternal: false,
          method: 'GET',
          path: '/in-window-a',
          requestTimeMs: 20,
          status: 200,
          time: now - 55_000,
        },
        {
          host: 'tuturuuu.com',
          isInternal: false,
          method: 'GET',
          path: '/in-window-b',
          requestTimeMs: 24,
          status: 200,
          time: now - 45_000,
        },
      ];
      const floodRequests = Array.from({ length: 105 }, (_, index) => ({
        host: 'tuturuuu.com',
        isInternal: false,
        method: 'GET',
        path: `/flood-${index}`,
        requestTimeMs: 4,
        status: 200,
        time: now - 20_000 + index,
      }));
      const requests = [...inWindowRequests, ...floodRequests];

      fs.writeFileSync(
        path.join(watchDir, 'blue-green-request-telemetry.state.json'),
        JSON.stringify({
          chunks: [
            {
              count: requests.length,
              file: 'requests-1.jsonl',
              firstRequestAt: inWindowRequests[0]?.time,
              lastRequestAt: floodRequests.at(-1)?.time,
            },
          ],
          currentChunkCount: requests.length,
          currentChunkFile: 'requests-1.jsonl',
          totalRecords: requests.length,
        })
      );
      fs.writeFileSync(
        path.join(requestLogDir, 'requests-1.jsonl'),
        requests.map((entry) => JSON.stringify(entry)).join('\n')
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;
      process.env.PLATFORM_LOG_DRAIN_ENABLED = 'false';

      const page = await readObservabilityRequests({
        pageSize: 10,
        timeframeHours: 1,
        until,
      });

      expect(page.total).toBe(2);
      expect(page.items.map((request) => request.path)).toEqual([
        '/in-window-b',
        '/in-window-a',
      ]);
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
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

  it('keeps an old failed attempt separate from a newer successful same-commit deployment', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'observability-deployment-retry-')
    );

    try {
      fs.mkdirSync(path.join(tempDir, 'prod'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'watch'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'watch', 'blue-green-auto-deploy.history.json'),
        JSON.stringify([
          {
            activeColor: 'green',
            commitHash: '4ba6d3b1d0ff',
            commitShortHash: '4ba6d3b1d0',
            commitSubject: 'Ship latest platform',
            deploymentKind: 'promotion',
            deploymentStamp: 'deploy-old-failed',
            failureReason: 'docker buildx bake failed',
            stages: [
              {
                failureReason: 'docker buildx bake failed',
                id: 'web-build',
                status: 'failed',
                target: 'web',
              },
            ],
            startedAt: Date.UTC(2026, 4, 31, 5, 0, 0),
            status: 'failed',
          },
          {
            activeColor: 'green',
            commitHash: '4ba6d3b1d0ff',
            commitShortHash: '4ba6d3b1d0',
            commitSubject: 'Ship latest platform',
            deploymentKind: 'promotion',
            deploymentStamp: 'deploy-new-success',
            stages: [
              {
                id: 'web-build',
                status: 'succeeded',
                target: 'web',
              },
              {
                id: 'web-promote',
                status: 'succeeded',
                target: 'web',
              },
            ],
            startedAt: Date.UTC(2026, 4, 31, 6, 0, 0),
            status: 'successful',
          },
        ])
      );
      fs.writeFileSync(
        path.join(tempDir, 'prod', 'target-state.json'),
        JSON.stringify({
          targets: {
            hive: {},
            web: {
              activeColor: 'green',
              commitHash: '4ba6d3b1d0ff',
              commitShortHash: '4ba6d3b1d0',
              deploymentStamp: 'deploy-new-success',
              health: 'healthy',
              lastPromotedAt: Date.UTC(2026, 4, 31, 6, 0, 1),
            },
          },
          version: 1,
        })
      );
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR = tempDir;

      const deployments = await readObservabilityDeployments({
        pageSize: 10,
        projectId: 'test-project',
      });

      expect(deployments.items).toHaveLength(2);
      expect(deployments.items[0]).toMatchObject({
        deploymentStamp: 'deploy-new-success',
        stageSummary: {
          blockedTargets: [],
          failedStageCount: 0,
        },
        status: 'successful',
      });
      expect(deployments.items[1]).toMatchObject({
        deploymentStamp: 'deploy-old-failed',
        failureReason: 'docker buildx bake failed',
        stageSummary: {
          blockedTargets: ['web'],
          failedStageCount: 1,
        },
        status: 'failed',
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
