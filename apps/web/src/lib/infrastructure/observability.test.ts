import { describe, expect, it } from 'vitest';
import { getBuildResources, parseObservabilityFilters } from './observability';

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

    expect(buildResources.containers).toHaveLength(1);
    expect(buildResources.containers[0]?.containerId).toBe('buildkit-1');
    expect(buildResources.state).toBe('live');
    expect(buildResources.totalCpuPercent).toBe(7.5);
    expect(buildResources.totalMemoryBytes).toBe(512 * 1024 * 1024);
    expect(buildResources.totalRxBytes).toBe(2048);
    expect(buildResources.totalTxBytes).toBe(4096);
  });
});
