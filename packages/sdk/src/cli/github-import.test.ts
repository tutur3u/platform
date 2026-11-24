import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chunk,
  formatSummary,
  loadGithubMapping,
  parseGithubImportFlags,
  runGithubImport,
  selectIssues,
  summarizeResults,
} from './github-import-command';
import { node, norm } from './github-import-fixtures.test-support';

afterEach(() => vi.restoreAllMocks());

describe('flags', () => {
  const parse = (flags: Record<string, string | boolean>) =>
    parseGithubImportFlags(flags);
  const base = { from: 'github', repo: 'tutur3u/platform', board: 'b1' };

  it('parses the selection flags', () => {
    const options = parse({
      ...base,
      state: 'open',
      since: '2026-01-31',
      limit: '5',
      issues: '1, #2,3',
      'exclude-issues': '9',
      mapping: 'm.json',
      'dry-run': true,
    });
    expect(options).toMatchObject({
      state: 'open',
      limit: 5,
      dryRun: true,
      batchSize: 25,
      mappingPath: 'm.json',
    });
    expect([...options.only!]).toEqual([1, 2, 3]);
    expect([...options.exclude]).toEqual([9]);
  });

  it('accepts --only-issues as an alias and defaults to all issues', () => {
    const options = parse({ ...base, 'only-issues': '7' });
    expect([...options.only!]).toEqual([7]);
    expect(options.state).toBe('all');
  });

  it.each([
    [{ board: 'b1', repo: 'a/b' }, 'Only --from github'],
    [{ from: 'github', repo: 'a/b' }, '--board'],
    [{ from: 'github', board: 'b1' }, '--repo'],
    [{ from: 'github', board: 'b1', repo: 'nope' }, 'owner/name'],
    [{ ...base, state: 'merged' }, '--state'],
    [{ ...base, since: 'soon' }, '--since'],
    [{ ...base, limit: '0' }, '--limit'],
    [{ ...base, 'batch-size': '26' }, '--batch-size'],
    [{ ...base, 'batch-size': '0' }, '--batch-size'],
    [{ ...base, issues: 'a,b' }, '--issues'],
    [{ ...base, 'exclude-issues': '' }, '--exclude-issues'],
  ])('rejects bad input %#', (flags, message) => {
    expect(() => parse(flags as never)).toThrow(message);
  });

  it('allows --input without --repo', () => {
    expect(
      parse({ from: 'github', board: 'b1', input: 'issues.json' }).repo
    ).toBeNull();
  });
});

describe('selectIssues', () => {
  const issues = [1, 2, 3, 4, 5].map((n) =>
    norm(n, {
      state: n === 5 ? 'OPEN' : 'CLOSED',
      createdAt: `2023-0${n}-01T00:00:00Z`,
      closedAt: n === 2 ? '2022-01-01T00:00:00Z' : '2023-06-01T00:00:00Z',
    })
  );
  const select = (over: Record<string, unknown>) =>
    selectIssues(issues, {
      state: 'all',
      since: null,
      only: null,
      exclude: new Set(),
      limit: null,
      ...over,
    } as never).map((i) => i.number);

  it('filters by state, oldest first', () => {
    expect(select({})).toEqual([1, 2, 3, 4, 5]);
    expect(select({ state: 'open' })).toEqual([5]);
    expect(select({ state: 'closed' })).toEqual([1, 2, 3, 4]);
  });

  it('splits one run across workspaces with only and exclude', () => {
    const security = new Set([2, 4]);
    expect(select({ only: security })).toEqual([2, 4]);
    expect(select({ exclude: security })).toEqual([1, 3, 5]);
    expect(select({ only: security, exclude: new Set([4]) })).toEqual([2]);
  });

  it('keeps open issues and recently closed ones for --since, then limits', () => {
    expect(select({ since: '2023-01-01' })).toEqual([1, 3, 4, 5]);
    expect(select({ limit: 2 })).toEqual([1, 2]);
  });
});

describe('chunk', () => {
  it('never exceeds the batch size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(
      chunk(
        Array.from({ length: 51 }, (_, i) => i),
        25
      ).map((b) => b.length)
    ).toEqual([25, 25, 1]);
    expect(chunk([], 25)).toEqual([]);
  });
});

const runImport = (
  client: { tasks: { collaboration: unknown } },
  workspaceId: string,
  flags: Record<string, string | boolean>,
  json: boolean,
  deps: Parameters<typeof runGithubImport>[4] = {}
) =>
  runGithubImport(client as never, workspaceId, flags, json, {
    api: client.tasks.collaboration as never,
    ...deps,
  });

describe('runGithubImport', () => {
  function fakeClient(
    respond?: (payload: {
      issues: Array<{ url: string; number: number }>;
      dry_run: boolean;
    }) => unknown
  ) {
    const importGithub = vi.fn(
      async (
        _ws: string,
        payload: {
          issues: Array<{ url: string; number: number }>;
          dry_run: boolean;
        }
      ) =>
        (respond?.(payload) as never) ?? {
          results: payload.issues.map((issue) => ({
            url: issue.url,
            number: issue.number,
            action: 'create',
            task_id: payload.dry_run ? null : `t${issue.number}`,
            warnings: [],
          })),
        }
    );
    return {
      importGithub,
      client: { tasks: { collaboration: { importGithub } } } as never,
    };
  }
  const flags = { from: 'github', repo: 'tutur3u/platform', board: 'b1' };
  const capture = () => {
    let out = '';
    vi.spyOn(process.stdout, 'write').mockImplementation(
      (chunk) => ((out += String(chunk)), true)
    );
    return () => out;
  };
  const fetchIssues = (count: number) => async () =>
    Array.from({ length: count }, (_, i) => node(i + 1)) as never;

  it('posts batches of at most 25 and prints the summary', async () => {
    const { importGithub, client } = fakeClient();
    const out = capture();
    await runImport(client, 'ws-1', flags, false, {
      fetchIssues: fetchIssues(60),
    });
    expect(
      importGithub.mock.calls.map(([, payload]) => payload.issues.length)
    ).toEqual([25, 25, 10]);
    expect(importGithub.mock.calls[0]?.[0]).toBe('ws-1');
    expect(out()).toBe('60 created, 0 updated, 0 skipped, 0 failed\n');
  });

  it('leaves content alone on re-runs unless --refresh-content is given', async () => {
    const { importGithub, client } = fakeClient();
    capture();
    await runImport(client, 'ws-1', flags, false, {
      fetchIssues: fetchIssues(1),
    });
    await runImport(
      client,
      'ws-1',
      { ...flags, 'refresh-content': true },
      false,
      { fetchIssues: fetchIssues(1) }
    );
    expect(
      importGithub.mock.calls.map(
        ([, payload]) =>
          (payload as unknown as { refresh_content: boolean }).refresh_content
      )
    ).toEqual([false, true]);
  });

  it('honors --batch-size and --dry-run', async () => {
    const { importGithub, client } = fakeClient();
    const out = capture();
    await runImport(
      client,
      'ws-1',
      { ...flags, 'batch-size': '10', 'dry-run': true },
      false,
      { fetchIssues: fetchIssues(25) }
    );
    expect(
      importGithub.mock.calls.map(([, p]) => [p.issues.length, p.dry_run])
    ).toEqual([
      [10, true],
      [10, true],
      [5, true],
    ]);
    expect(out()).toContain('Dry run: 25 created');
  });

  it('splits a run with only and exclude and sends the mapping file', async () => {
    const mappingPath = join(
      await mkdtemp(join(tmpdir(), 'ttr-map-')),
      'mapping.json'
    );
    await writeFile(
      mappingPath,
      JSON.stringify({
        status_lists: { open_list_id: 'l1' },
        assignees: { vhpx: 'u1' },
      })
    );
    const { importGithub, client } = fakeClient();
    capture();
    await runImport(
      client,
      'ws-1',
      {
        ...flags,
        'only-issues': '2,3',
        'exclude-issues': '3',
        mapping: mappingPath,
      },
      false,
      { fetchIssues: fetchIssues(5) }
    );
    const payload = importGithub.mock.calls[0]![1] as unknown as {
      issues: Array<{ number: number }>;
      mapping: unknown;
      board_id: string;
    };
    expect(payload.issues.map((i) => i.number)).toEqual([2]);
    expect(payload.board_id).toBe('b1');
    expect(payload.mapping).toEqual({
      status_lists: { open_list_id: 'l1' },
      assignees: { vhpx: 'u1' },
    });
  });

  it('reads a saved export with --input and never calls gh', async () => {
    const input = join(
      await mkdtemp(join(tmpdir(), 'ttr-input-')),
      'issues.json'
    );
    await writeFile(input, JSON.stringify([node(1), node(2)]));
    const { importGithub, client } = fakeClient();
    const fetchSpy = vi.fn();
    capture();
    await runImport(
      client,
      'ws-1',
      { from: 'github', board: 'b1', input },
      false,
      { fetchIssues: fetchSpy }
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    const payload = importGithub.mock.calls[0]![1] as unknown as {
      issues: Array<{ repo: string }>;
    };
    expect(payload.issues.map((i) => i.repo)).toEqual([
      'tutur3u/platform',
      'tutur3u/platform',
    ]);
  });

  it('retries transient failures and fails fast on others', async () => {
    const sleep = vi.fn(async () => undefined);
    const importGithub = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 503 unavailable'))
      .mockResolvedValue({
        results: [
          { url: 'u', number: 1, action: 'skip', task_id: 't', warnings: [] },
        ],
      });
    capture();
    await runImport(
      { tasks: { collaboration: { importGithub } } } as never,
      'ws-1',
      flags,
      false,
      { fetchIssues: fetchIssues(1), sleep }
    );
    expect(importGithub).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);

    const denied = vi
      .fn()
      .mockRejectedValue(new Error('Workspace access denied'));
    await expect(
      runImport(
        { tasks: { collaboration: { importGithub: denied } } } as never,
        'ws-1',
        flags,
        false,
        { fetchIssues: fetchIssues(1), sleep }
      )
    ).rejects.toThrow('access denied');
    expect(denied).toHaveBeenCalledTimes(1);
  });

  it('reports failures and sets a failing exit code', async () => {
    const { client } = fakeClient((payload) => ({
      results: payload.issues.map((issue) => ({
        url: issue.url,
        number: issue.number,
        action: 'skip',
        task_id: null,
        warnings: [],
        error: 'create failed',
      })),
    }));
    const out = capture();
    const before = process.exitCode;
    await runImport(client, 'ws-1', flags, false, {
      fetchIssues: fetchIssues(2),
    });
    expect(out()).toContain('2 failed');
    expect(out()).toContain('Failed #1: create failed');
    expect(process.exitCode).toBe(1);
    process.exitCode = before;
  });

  it('prints machine-readable output with --json and handles empty selections', async () => {
    const { client } = fakeClient();
    const out = capture();
    await runImport(client, 'ws-1', flags, true, {
      fetchIssues: fetchIssues(1),
    });
    expect(JSON.parse(out()).summary).toMatchObject({ created: 1, failed: 0 });
    const empty = capture();
    await runImport(client, 'ws-1', { ...flags, issues: '99' }, false, {
      fetchIssues: fetchIssues(1),
    });
    expect(empty()).toContain('No issues matched.');
  });
});

describe('summaries and mapping', () => {
  it('counts actions and groups warnings by kind', () => {
    const summary = summarizeResults(
      [
        {
          url: 'a',
          number: 1,
          action: 'create',
          task_id: 't',
          warnings: ['unmapped_assignees: x'],
        },
        {
          url: 'b',
          number: 2,
          action: 'update',
          task_id: 't',
          warnings: ['unmapped_assignees: y'],
        },
        { url: 'c', number: 3, action: 'skip', task_id: 't', warnings: [] },
      ],
      false
    );
    expect(summary).toMatchObject({
      created: 1,
      updated: 1,
      skipped: 1,
      failed: 0,
      warnings: { unmapped_assignees: 2 },
    });
    expect(formatSummary(summary)).toContain('unmapped_assignees x2');
  });

  it('requires status_lists in a mapping file', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'ttr-map-')), 'm.json');
    await writeFile(path, '{}');
    await expect(loadGithubMapping(path)).rejects.toThrow('status_lists');
    expect(await loadGithubMapping(null)).toEqual({ status_lists: {} });
  });
});
