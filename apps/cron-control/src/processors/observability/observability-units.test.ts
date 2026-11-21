import { expect, it } from 'vite-plus/test';
import {
  BUCKET_MS,
  durableObjectRollups,
  MAX_BUCKETS_PER_RUN,
  planCloudflareWindow,
  workerRollups,
} from './cloudflare';
import { fitRows, type RollupRow } from './collector';
import {
  deployMarker,
  percentile,
  planGithubWindow,
  workflowSlug,
} from './github';

const NOW = Date.parse('2026-11-21T03:15:00Z');

it('plans Cloudflare reads from the watermark with a bounded catch-up', () => {
  expect(planCloudflareWindow(NOW, null)).toEqual({
    since: Date.parse('2026-11-21T02:00:00Z'),
    until: Date.parse('2026-11-21T03:00:00Z'),
  });
  // Steady state re-reads the two buckets before the watermark.
  expect(planCloudflareWindow(NOW, Date.parse('2026-11-21T03:00:00Z'))).toEqual(
    {
      since: Date.parse('2026-11-21T02:30:00Z'),
      until: Date.parse('2026-11-21T03:00:00Z'),
    }
  );
  // After an outage, a run advances at most four buckets from the watermark.
  const behind = Date.parse('2026-11-20T20:00:00Z');
  const window = planCloudflareWindow(NOW, behind)!;
  expect(window.since).toBe(behind - 2 * BUCKET_MS);
  expect(window.until - window.since).toBe(MAX_BUCKETS_PER_RUN * BUCKET_MS);
  // Nothing older than seven days is read.
  const ancient = planCloudflareWindow(
    NOW,
    Date.parse('2026-10-01T00:00:00Z')
  )!;
  expect(ancient.since).toBe(Date.parse('2026-11-14T03:00:00Z'));
  // No closed bucket yet past the watermark plus re-read: still re-reads.
  expect(
    planCloudflareWindow(NOW, Date.parse('2026-11-21T03:00:00Z'))
  ).not.toBeNull();
});

it('converts microsecond quantiles and drops groups outside the window', () => {
  const window = {
    since: Date.parse('2026-11-21T02:00:00Z'),
    until: Date.parse('2026-11-21T02:15:00Z'),
  };
  const { rows } = workerRollups(
    {
      data: {
        viewer: {
          accounts: [
            {
              workersInvocationsAdaptive: [
                {
                  dimensions: {
                    scriptName: 'Tuturuuu-Web',
                    datetimeFifteenMinutes: '2026-11-21T02:00:00Z',
                  },
                  sum: { requests: 10, errors: 0, subrequests: 2 },
                  quantiles: { cpuTimeP50: 999, requestDurationP95: 123_456 },
                },
                {
                  dimensions: {
                    scriptName: 'tuturuuu-web',
                    datetimeFifteenMinutes: '2026-11-21T02:15:00Z',
                  },
                  sum: { requests: 99 },
                },
                {
                  dimensions: {
                    scriptName: 'bad name!',
                    datetimeFifteenMinutes: '2026-11-21T02:00:00Z',
                  },
                  sum: { requests: 1 },
                },
              ],
            },
          ],
        },
      },
    },
    window
  );
  const byMetric = Object.fromEntries(rows.map((row) => [row.metric, row]));
  expect(byMetric.requests).toMatchObject({
    service: 'tuturuuu-web',
    value: 10,
  });
  expect(byMetric.cpu_p50_ms?.value).toBe(1);
  expect(byMetric.duration_p95_ms?.value).toBe(123.46);
  expect(
    rows.every((row) => row.bucket_start === '2026-11-21T02:00:00.000Z')
  ).toBe(true);
});

it('fails closed on GraphQL errors and sums Durable Object groups', () => {
  const window = {
    since: Date.parse('2026-11-21T02:00:00Z'),
    until: Date.parse('2026-11-21T02:15:00Z'),
  };
  expect(() => workerRollups({ errors: [{ message: 'x' }] }, window)).toThrow();
  expect(() => workerRollups({ data: {} }, window)).toThrow();
  const group = (requests: number, errors: number) => ({
    dimensions: {
      scriptName: 'tuturuuu-meet',
      datetimeFifteenMinutes: '2026-11-21T02:00:00Z',
    },
    sum: { requests, errors },
  });
  const { rows } = durableObjectRollups(
    {
      data: {
        viewer: {
          accounts: [
            {
              durableObjectsInvocationsAdaptiveGroups: [
                group(3, 1),
                group(4, 0),
              ],
            },
          ],
        },
      },
    },
    window
  );
  expect(rows.map((row) => [row.metric, row.value])).toEqual([
    ['do_requests', 7],
    ['do_errors', 1],
  ]);
});

it('keeps whole buckets under the row cap and points the watermark at the rest', () => {
  const row = (bucket: string, metric: string): RollupRow => ({
    bucket_seconds: 900,
    bucket_start: bucket,
    metric,
    service: 'svc',
    value: 1,
  });
  const rows = [
    row('2026-11-21T02:15:00.000Z', 'a'),
    row('2026-11-21T02:00:00.000Z', 'a'),
    row('2026-11-21T02:00:00.000Z', 'b'),
    row('2026-11-21T02:15:00.000Z', 'b'),
  ];
  expect(fitRows(rows, 4).cutoff).toBeNull();
  const fitted = fitRows(rows, 3);
  expect(fitted.rows).toHaveLength(2);
  expect(fitted.cutoff).toBe(Date.parse('2026-11-21T02:15:00Z'));
});

it('plans GitHub 15-minute buckets after they settle, twelve at a time', () => {
  expect(planGithubWindow(NOW, null)).toEqual({
    since: Date.parse('2026-11-20T19:15:00Z'),
    until: Date.parse('2026-11-20T22:15:00Z'),
  });
  expect(planGithubWindow(NOW, Date.parse('2026-11-21T01:15:00Z'))).toBeNull();
});

it('marks only successful production deploys on main', () => {
  const base = {
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_sha: 'c'.repeat(40),
    id: 7,
    updated_at: '2026-11-21T01:00:00Z',
  };
  expect(
    deployMarker({
      ...base,
      path: '.github/workflows/vercel-production-platform.yaml',
    })
  ).toMatchObject({ service: 'web' });
  expect(
    deployMarker({
      ...base,
      path: '.github/workflows/supabase-production.yaml',
    })
  ).toMatchObject({ service: 'supabase' });
  expect(
    deployMarker({ ...base, path: '.github/workflows/ci.yaml' })
  ).toBeNull();
  expect(
    deployMarker({
      ...base,
      path: '.github/workflows/meet-cloudflare.yaml',
      head_branch: 'feature/x',
    })
  ).toBeNull();
  expect(
    deployMarker({
      ...base,
      path: '.github/workflows/meet-cloudflare.yaml',
      conclusion: 'failure',
    })
  ).toBeNull();
  expect(workflowSlug('.github/workflows/CI Summary.yml')).toBeNull();
  expect(percentile([5, 1, 3], 50)).toBe(3);
  expect(percentile([], 95)).toBeNull();
});
