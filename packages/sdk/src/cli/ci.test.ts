import { describe, expect, it, vi } from 'vitest';
import { type CachedResult, type CiCache, RateBudgetError } from './ci-cache';
import { resolveSha, runsTtl } from './ci-github';
import { summarizeRuns } from './ci-status';
import { parseCiArgs, runCiCommand } from './ci';

const SHA = 'a'.repeat(40);

const run = (over: Record<string, unknown>) => ({
  id: 1,
  name: 'CI',
  path: '.github/workflows/ci.yaml',
  event: 'push',
  workflow_id: 10,
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-11-28T10:00:00Z',
  ...over,
});

describe('summarizeRuns', () => {
  it('keeps the latest run per workflow and event and aggregates failure first', () => {
    const status = summarizeRuns({
      total_count: 3,
      workflow_runs: [
        run({ id: 1, conclusion: 'failure' }),
        run({ id: 2, created_at: '2026-11-28T11:00:00Z' }),
        run({
          id: 3,
          name: 'Deploy',
          path: '.github/workflows/deploy.yaml',
          workflow_id: 11,
          conclusion: 'cancelled',
        }),
      ],
    });
    expect(status.runs.map((r) => r.id)).toEqual([1 + 1, 3]);
    expect(status.state).toBe('failure');
  });

  it('filters by name, file name or path and reports pending and none', () => {
    const page = {
      workflow_runs: [
        run({ id: 1, status: 'in_progress', conclusion: null }),
        run({
          id: 2,
          name: 'Lint',
          path: '.github/workflows/lint.yml',
          workflow_id: 12,
        }),
      ],
    };
    expect(summarizeRuns(page, ['ci.yaml']).state).toBe('pending');
    expect(summarizeRuns(page, ['lint']).state).toBe('success');
    expect(
      summarizeRuns(page, ['.github/workflows/lint.yml']).runs
    ).toHaveLength(1);
    expect(summarizeRuns(page, ['missing']).state).toBe('none');
  });

  it('chooses a longer TTL only when every run completed', () => {
    expect(runsTtl({ workflow_runs: [run({})] })).toBe(120_000);
    expect(
      runsTtl({ workflow_runs: [run({}), run({ status: 'queued' })] })
    ).toBe(20_000);
    expect(runsTtl({ workflow_runs: [] })).toBe(20_000);
  });
});

describe('arguments', () => {
  it('parses wait options and clamps the interval', () => {
    expect(
      parseCiArgs([
        'wait',
        'tutur3u/platform',
        SHA,
        '--workflow',
        'CI',
        '--timeout',
        '10m',
        '--interval',
        '1s',
      ])
    ).toMatchObject({
      action: 'wait',
      repo: 'tutur3u/platform',
      workflows: ['CI'],
      timeoutMs: 600_000,
      intervalMs: 15_000,
    });
    expect(() => parseCiArgs(['status', 'not-a-repo', SHA])).toThrow();
    expect(() => parseCiArgs(['status', 'a/b'])).toThrow();
  });

  it('resolves short SHAs only through local git', () => {
    expect(resolveSha(SHA.toUpperCase())).toBe(SHA);
    expect(resolveSha('abc123', () => `${'b'.repeat(40)}\n`)).toBe(
      'b'.repeat(40)
    );
    expect(() =>
      resolveSha('abc123', () => {
        throw new Error('no repo');
      })
    ).toThrow(/40 hex/);
  });
});

function fakeCache(replies: (() => CachedResult)[]) {
  const get = vi.fn(async () => {
    const next = replies.shift();
    if (!next) throw new Error('no more replies');
    return next();
  });
  return {
    cache: { get, readLedger: async () => ({}) } as unknown as CiCache,
    get,
  };
}

const page =
  (status: string, conclusion: string | null) => (): CachedResult => ({
    body: { workflow_runs: [run({ status, conclusion })] },
    source: 'fetched',
    stale: false,
    fetchedAt: 0,
  });

describe('ttr ci wait', () => {
  const base = (cache: CiCache, clock: { t: number }) => ({
    cache,
    now: () => clock.t,
    random: () => 0.5,
    sleep: async (ms: number) => {
      clock.t += ms;
    },
    write: () => {},
  });

  it('waits through pending runs and exits 0 on success', async () => {
    const clock = { t: 0 };
    const { cache, get } = fakeCache([
      page('queued', null),
      page('in_progress', null),
      page('completed', 'success'),
    ]);
    const code = await runCiCommand(
      ['wait', 'tutur3u/platform', SHA],
      base(cache, clock)
    );
    expect(code).toBe(0);
    expect(get).toHaveBeenCalledTimes(3);
    expect(clock.t).toBe(120_000);
  });

  it('exits 1 on a failed run', async () => {
    const { cache } = fakeCache([page('completed', 'failure')]);
    expect(
      await runCiCommand(['wait', 'a/b', SHA], base(cache, { t: 0 }))
    ).toBe(1);
  });

  it('sleeps until the rate reset under backpressure instead of polling', async () => {
    const clock = { t: 0 };
    const { cache, get } = fakeCache([
      () => {
        throw new RateBudgetError('exhausted', 600_000);
      },
      page('completed', 'success'),
    ]);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const code = await runCiCommand(['wait', 'a/b', SHA], base(cache, clock));
    stderr.mockRestore();
    expect(code).toBe(0);
    expect(get).toHaveBeenCalledTimes(2);
    expect(clock.t).toBe(600_000);
  });

  it('times out with stale metadata when a cached success cannot be revalidated', async () => {
    const stale = () => ({
      ...page('completed', 'success')(),
      stale: true,
      source: 'stale' as const,
      resetAt: 600_000,
    });
    const { cache } = fakeCache([stale, stale]);
    const write = vi.fn();
    const code = await runCiCommand(
      ['wait', 'a/b', SHA, '--timeout', '1s', '--json'],
      { ...base(cache, { t: 0 }), write }
    );
    expect(code).toBe(124);
    expect(JSON.parse(write.mock.calls[0]![0])).toMatchObject({
      source: 'timeout',
      stale: true,
    });
  });

  it('waits for a failed workflow on the next run page', async () => {
    const first = () => ({
      ...page('completed', 'success')(),
      body: { total_count: 2, workflow_runs: [run({ id: 1 })] },
    });
    const second = () => ({
      ...page('completed', 'failure')(),
      body: {
        total_count: 2,
        workflow_runs: [
          run({
            id: 2,
            name: 'Target',
            status: 'completed',
            conclusion: 'failure',
          }),
        ],
      },
    });
    const { cache, get } = fakeCache([first, second]);
    const code = await runCiCommand(
      ['wait', 'a/b', SHA, '--workflow', 'Target'],
      base(cache, { t: 0 })
    );
    expect(code).toBe(1);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('exits 124 at the deadline', async () => {
    const clock = { t: 0 };
    const pending = Array.from({ length: 10 }, () => page('queued', null));
    const { cache } = fakeCache(pending);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const code = await runCiCommand(
      ['wait', 'a/b', SHA, '--timeout', '2m'],
      base(cache, clock)
    );
    stderr.mockRestore();
    expect(code).toBe(124);
    expect(clock.t).toBe(120_000);
  });

  it('status exits 75 when rate limited with no cached answer', async () => {
    const { cache } = fakeCache([
      () => {
        throw new RateBudgetError('exhausted', 1);
      },
    ]);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const code = await runCiCommand(
      ['status', 'a/b', SHA],
      base(cache, { t: 0 })
    );
    stderr.mockRestore();
    expect(code).toBe(75);
  });
});
