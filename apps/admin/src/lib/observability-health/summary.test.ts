import { describe, expect, it } from 'vitest';
import {
  appForService,
  BUCKET_MS,
  markerMatches,
  parseRange,
  parseService,
  type RollupInput,
  serviceSeries,
  summarizeServices,
} from './summary';

const UNTIL = Date.parse('2026-11-21T04:00:00Z');
const WINDOW = { since: UNTIL - 4 * BUCKET_MS, until: UNTIL };

function bucket(index: number) {
  return new Date(WINDOW.since + index * BUCKET_MS).toISOString();
}

function rows(
  service: string,
  index: number,
  values: Record<string, number>
): RollupInput[] {
  return Object.entries(values).map(([metric, value]) => ({
    bucket_start: bucket(index),
    metric,
    service,
    value,
  }));
}

describe('summarizeServices', () => {
  it('computes rates, weighted latency and status per service', () => {
    const input = [0, 1, 2, 3].flatMap((index) =>
      rows('tuturuuu-meet', index, {
        requests: index === 0 ? 300 : 100,
        errors: index === 0 ? 30 : 0,
        duration_p95_ms: index === 0 ? 200 : 100,
      })
    );
    const [meet] = summarizeServices(input, [], WINDOW);
    expect(meet).toMatchObject({
      coverage: 1,
      errors: 30,
      requests: 600,
      service: 'tuturuuu-meet',
      status: 'critical',
    });
    expect(meet?.errorRate).toBeCloseTo(0.05);
    expect(meet?.requestsPerMinute).toBeCloseTo(10);
    expect(meet?.p95Ms).toBeCloseTo((300 * 200 + 300 * 100) / 600);
  });

  it('reports missing buckets as unavailable, never healthy', () => {
    const [sparse] = summarizeServices(
      rows('tuturuuu-web', 0, { requests: 10, errors: 0 }),
      [],
      WINDOW
    );
    expect(sparse).toMatchObject({ coverage: 0.25, status: 'unavailable' });
  });

  it('ignores rows outside the window and sorts the worst first', () => {
    const input = [
      ...[0, 1, 2, 3].flatMap((index) =>
        rows('tuturuuu-a', index, {
          requests: 100,
          errors: 0,
          duration_p95_ms: 50,
        })
      ),
      ...[0, 1, 2, 3].flatMap((index) =>
        rows('tuturuuu-b', index, {
          requests: 10,
          errors: 1,
          duration_p95_ms: 50,
        })
      ),
      {
        bucket_start: new Date(UNTIL).toISOString(),
        metric: 'requests',
        service: 'tuturuuu-a',
        value: 999_999,
      },
    ];
    const summaries = summarizeServices(input, [], WINDOW);
    expect(summaries.map((s) => s.service)).toEqual([
      'tuturuuu-b',
      'tuturuuu-a',
    ]);
    expect(summaries[1]?.requests).toBe(400);
  });

  it('correlates the latest deploy by app slug', () => {
    const [meet] = summarizeServices(
      rows('tuturuuu-meet', 0, { requests: 1 }),
      [
        {
          deployed_at: '2026-11-20T01:00:00Z',
          service: 'meet',
          sha: null,
          version_id: 'gha-1',
        },
        {
          deployed_at: '2026-11-21T01:00:00Z',
          service: 'meet',
          sha: 'a'.repeat(40),
          version_id: 'gha-2',
        },
        {
          deployed_at: '2026-11-21T02:00:00Z',
          service: 'mail',
          sha: null,
          version_id: 'gha-3',
        },
      ],
      WINDOW
    );
    expect(meet?.latestDeploy?.version_id).toBe('gha-2');
    expect(appForService('tuturuuu-meet-staging')).toBe('meet');
    expect(appForService('tuturuuu-cron-control')).toBe('cron-control');
    expect(markerMatches('tuturuuu-meet-realtime', 'meet')).toBe(true);
    expect(markerMatches('tuturuuu-web-api-identity', 'web')).toBe(true);
    expect(markerMatches('tuturuuu-mail', 'meet')).toBe(false);
    expect(markerMatches('tuturuuu-chat-realtime', 'chat')).toBe(false);
    expect(markerMatches('tuturuuu-mastermind-store', 'mastermind')).toBe(
      false
    );
  });
});

it('uses the aggregated bucket count for coverage', () => {
  const [web] = summarizeServices(
    rows('tuturuuu-web', 0, {
      requests: 40,
      errors: 0,
      buckets: 3,
      duration_p95_ms: 100,
    }),
    [],
    WINDOW
  );
  expect(web).toMatchObject({ coverage: 0.75, status: 'healthy' });
});

it('reports a covered window without indicators as unavailable', () => {
  const [web] = summarizeServices(
    rows('tuturuuu-web', 0, { do_requests: 5, buckets: 4 }),
    [],
    WINDOW
  );
  expect(web?.status).toBe('unavailable');
  const [noLatency] = summarizeServices(
    rows('tuturuuu-web', 0, { requests: 100, errors: 0, buckets: 4 }),
    [],
    WINDOW
  );
  expect(noLatency?.status).toBe('unavailable');
});

describe('serviceSeries', () => {
  it('keeps gaps as nulls', () => {
    const series = serviceSeries(
      [
        ...rows('tuturuuu-meet', 0, { requests: 10, errors: 1 }),
        ...rows('tuturuuu-meet', 2, { requests: 20, errors: 0 }),
      ],
      'tuturuuu-meet',
      WINDOW
    );
    expect(series.map((point) => point.requests)).toEqual([10, null, 20, null]);
    expect(series[0]?.errorRate).toBeCloseTo(0.1);
  });

  it('anchors long ranges at the window start', () => {
    const until = Date.parse('2026-11-21T03:15:00Z');
    const window = { since: until - 7 * 24 * 3_600_000, until };
    const series = serviceSeries(
      [
        {
          bucket_start: new Date(window.since + 50 * 60_000).toISOString(),
          metric: 'requests',
          service: 'x',
          value: 5,
        },
      ],
      'x',
      window
    );
    expect(series).toHaveLength(168);
    expect(series[0]).toMatchObject({
      at: new Date(window.since).toISOString(),
      requests: 5,
    });
  });

  it('merges long ranges into coarser points', () => {
    const end = Date.parse('2026-11-21T06:00:00Z');
    const window = { since: end - 30 * 24 * 3_600_000, until: end };
    expect(serviceSeries([], 'x', window)).toHaveLength(120);
  });
});

it('parses only known ranges and valid service names', () => {
  expect(parseRange('7d')).toBe('7d');
  expect(parseRange('1y')).toBe('24h');
  expect(parseRange(['7d'])).toBe('24h');
  expect(parseService('tuturuuu-meet')).toBe('tuturuuu-meet');
  expect(parseService('../etc')).toBeNull();
});
