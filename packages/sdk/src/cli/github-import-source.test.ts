import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { node, norm } from './github-import-fixtures.test-support';
import { fetchGithubIssues, isRateLimitError } from './github-import-source';

afterEach(() => vi.restoreAllMocks());

describe('normalizeGithubIssue', () => {
  it('lowercases state, keeps the close reason and extracts links and events', () => {
    const issue = norm(1);
    expect(issue).toMatchObject({
      repo: 'tutur3u/platform',
      state: 'closed',
      state_reason: 'completed',
      author: 'octocat',
      labels: ['bug'],
      assignees: ['vhpx'],
      milestone: 'v0.12',
    });
    expect(issue.comments[0]?.author).toBeNull();
    expect(
      issue.linked_prs.map((p) => [p.url.split('/').pop(), p.state, p.merged])
    ).toEqual([
      ['10', 'open', false],
      ['9', 'merged', true],
    ]);
    expect(issue.linked_commits).toEqual([
      {
        url: 'https://github.com/tutur3u/platform/commit/abc1234',
        oid: 'abc1234',
      },
    ]);
    expect(issue.events).toEqual([
      {
        event: 'labeled',
        at: '2023-05-01T00:00:00Z',
        actor: 'vhpx',
        label: 'bug',
      },
      { event: 'closed', at: '2023-06-01T00:00:00Z', actor: 'vhpx' },
    ]);
  });

  it('maps parents, sub-issues and not-planned closes', () => {
    const issue = norm(2, {
      stateReason: 'NOT_PLANNED',
      parent: { url: 'https://github.com/tutur3u/platform/issues/1' },
      subIssues: {
        nodes: [{ url: 'https://github.com/tutur3u/platform/issues/3' }],
      },
    });
    expect(issue.state_reason).toBe('not_planned');
    expect(issue.parent_url).toBe(
      'https://github.com/tutur3u/platform/issues/1'
    );
    expect(issue.sub_issue_urls).toEqual([
      'https://github.com/tutur3u/platform/issues/3',
    ]);
  });
});

describe('fetchGithubIssues', () => {
  function pagedGh(total: number, failures: string[] = []) {
    const calls: string[][] = [];
    const runGh = vi.fn(async (args: string[]) => {
      calls.push(args);
      const failure = failures.shift();
      if (failure)
        throw Object.assign(new Error(failure), { ghOutput: failure });
      const after = args.find((a) => a.startsWith('after='))?.slice(6);
      const start = after ? Number.parseInt(after, 10) : 0;
      const nodes = Array.from(
        { length: Math.min(25, total - start) },
        (_, i) => node(start + i + 1)
      );
      const hasNextPage = start + 25 < total;
      return JSON.stringify({
        data: {
          rateLimit: {
            cost: 1,
            remaining: 4000,
            resetAt: '2026-11-24T12:00:00Z',
          },
          repository: {
            issues: {
              pageInfo: { hasNextPage, endCursor: String(start + 25) },
              nodes,
            },
          },
        },
      });
    });
    return { calls, runGh };
  }
  const dir = () => mkdtemp(join(tmpdir(), 'ttr-gh-cache-'));

  it('pages 25 at a time and caches every page', async () => {
    const cacheDir = await dir();
    const { calls, runGh } = pagedGh(60);
    const first = await fetchGithubIssues({
      repo: 'tutur3u/platform',
      state: 'all',
      runGh,
      cacheDir,
    });
    expect(first).toHaveLength(60);
    expect(calls).toHaveLength(3);
    expect(calls.every((args) => args.includes('first=25'))).toBe(true);
    expect((await readdir(cacheDir)).length).toBe(3);

    const second = await fetchGithubIssues({
      repo: 'tutur3u/platform',
      state: 'all',
      runGh,
      cacheDir,
    });
    expect(second).toHaveLength(60);
    expect(runGh).toHaveBeenCalledTimes(3);
  });

  it('bypasses the cache with refresh and keeps states apart', async () => {
    const cacheDir = await dir();
    const { runGh } = pagedGh(10);
    await fetchGithubIssues({
      repo: 'tutur3u/platform',
      state: 'all',
      runGh,
      cacheDir,
    });
    await fetchGithubIssues({
      repo: 'tutur3u/platform',
      state: 'all',
      runGh,
      cacheDir,
      refresh: true,
    });
    await fetchGithubIssues({
      repo: 'tutur3u/platform',
      state: 'open',
      runGh,
      cacheDir,
    });
    expect(runGh).toHaveBeenCalledTimes(3);
    expect(runGh.mock.calls[2]?.[0]).toContain('states[]=OPEN');
  });

  it('backs off on rate limits and then succeeds', async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    const { runGh } = pagedGh(5, [
      'API rate limit exceeded',
      'secondary rate limit',
    ]);
    const issues = await fetchGithubIssues({
      repo: 'tutur3u/platform',
      state: 'all',
      runGh,
      cacheDir: await dir(),
      sleep,
    });
    expect(issues).toHaveLength(5);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 4000]);
  });

  it('gives up after repeated rate limits and does not retry other failures', async () => {
    const { runGh } = pagedGh(5, Array(10).fill('API rate limit exceeded'));
    await expect(
      fetchGithubIssues({
        repo: 'tutur3u/platform',
        state: 'all',
        runGh,
        cacheDir: await dir(),
        sleep: async () => undefined,
      })
    ).rejects.toThrow('rate limit');
    expect(runGh).toHaveBeenCalledTimes(5);

    const other = pagedGh(5, ['gh: not logged in']);
    await expect(
      fetchGithubIssues({
        repo: 'tutur3u/platform',
        state: 'all',
        runGh: other.runGh,
        cacheDir: await dir(),
        sleep: async () => undefined,
      })
    ).rejects.toThrow('not logged in');
    expect(other.runGh).toHaveBeenCalledTimes(1);
  });

  it('waits for the reset when the budget is nearly spent', async () => {
    const sleep = vi.fn(async () => undefined);
    const runGh = vi.fn(async () =>
      JSON.stringify({
        data: {
          rateLimit: { cost: 1, remaining: 1, resetAt: '2026-11-24T12:00:30Z' },
          repository: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
        },
      })
    );
    await fetchGithubIssues({
      repo: 'tutur3u/platform',
      state: 'all',
      runGh,
      cacheDir: await dir(),
      sleep,
      now: () => Date.parse('2026-11-24T12:00:00Z'),
    });
    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it('never passes a token to gh or reads one from the environment', async () => {
    vi.stubEnv('GH_TOKEN', 'secret-token-value');
    const { calls, runGh } = pagedGh(3);
    await fetchGithubIssues({
      repo: 'tutur3u/platform',
      state: 'all',
      runGh,
      cacheDir: await dir(),
    });
    expect(JSON.stringify(calls)).not.toContain('secret-token-value');
    expect(calls[0]?.slice(0, 2)).toEqual(['api', 'graphql']);
    vi.unstubAllEnvs();
  });

  it('classifies rate limit errors', () => {
    expect(
      isRateLimitError(new Error('You have exceeded a secondary rate limit'))
    ).toBe(true);
    expect(
      isRateLimitError(new Error('Could not resolve to a Repository'))
    ).toBe(false);
  });
});
