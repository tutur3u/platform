import { describe, expect, it } from 'vitest';
import {
  buildMonitoringRouteSummaries,
  getMonitoringStatusFamily,
  parseMonitoringRequestPath,
} from './blue-green-monitoring-explorers.utils';

describe('parseMonitoringRequestPath', () => {
  it('extracts the normalized pathname, query signature, and RSC flag', () => {
    expect(
      parseMonitoringRequestPath('/ops?tab=traffic&_rsc=abc123&sort=latency')
    ).toEqual({
      isServerComponentRequest: true,
      pathname: '/ops',
      querySignature: '?_rsc&sort&tab',
      search: '?tab=traffic&_rsc=abc123&sort=latency',
      searchParamKeys: ['_rsc', 'sort', 'tab'],
    });
  });

  it('falls back safely when the request URI is malformed', () => {
    expect(parseMonitoringRequestPath('')).toEqual({
      isServerComponentRequest: false,
      pathname: '/',
      querySignature: '',
      search: '',
      searchParamKeys: [],
    });
  });
});

describe('getMonitoringStatusFamily', () => {
  it.each([
    [200, '2xx'],
    [302, '3xx'],
    [404, '4xx'],
    [503, '5xx'],
    [null, 'unknown'],
  ])('maps %s to %s', (status, family) => {
    expect(getMonitoringStatusFamily(status)).toBe(family);
  });
});

describe('buildMonitoringRouteSummaries', () => {
  it('groups request logs by normalized route and keeps RSC/query metadata', () => {
    const summaries = buildMonitoringRouteSummaries([
      {
        deploymentColor: 'green',
        deploymentKey: 'stamp:deploy-a',
        deploymentStamp: 'deploy-a',
        host: 'platform.test',
        isInternal: false,
        method: 'GET',
        path: '/ops?tab=traffic',
        requestTimeMs: 180,
        status: 200,
        time: Date.now(),
      },
      {
        deploymentColor: 'green',
        deploymentKey: 'stamp:deploy-a',
        deploymentStamp: 'deploy-a',
        host: 'platform.test',
        isInternal: false,
        method: 'GET',
        path: '/ops?tab=traffic&_rsc=1',
        requestTimeMs: 220,
        status: 200,
        time: Date.now(),
      },
      {
        deploymentColor: 'green',
        deploymentKey: 'stamp:deploy-a',
        deploymentStamp: 'deploy-a',
        host: 'platform.test',
        isInternal: true,
        method: 'GET',
        path: '/ops?tab=traffic&_rsc=1',
        requestTimeMs: 140,
        status: 503,
        time: Date.now(),
      },
    ]);

    expect(summaries).toEqual([
      {
        averageLatencyMs: 180,
        errorCount: 1,
        internalCount: 1,
        isServerComponentRoute: true,
        pathname: '/ops',
        querySignatures: ['?_rsc&tab', '?tab'],
        requestCount: 3,
        rscCount: 2,
      },
    ]);
  });
});
