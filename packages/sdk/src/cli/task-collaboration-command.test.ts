import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './commands';

const TASK = '22222222-2222-4222-8222-222222222222';
const BOARD = '33333333-3333-4333-8333-333333333333';
const TASKS_API = 'https://tasks.tuturuuu.com/api/v1/workspaces/ws-1';

type Call = { url: string; method: string; body: unknown };

describe('ttr tasks comment | link | timeline | status', () => {
  let calls: Call[];
  let out: string;
  let routes: Array<[RegExp, string, unknown]>;

  beforeEach(async () => {
    calls = [];
    out = '';
    routes = [];
    const dir = await mkdtemp(join(tmpdir(), 'tuturuuu-cli-collab-'));
    const path = join(dir, 'config.json');
    await writeFile(
      path,
      JSON.stringify({
        baseUrl: 'https://tuturuuu.com',
        currentWorkspaceId: 'ws-1',
        session: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      })
    );
    vi.stubEnv('TUTURUUU_CONFIG', path);
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      out += String(chunk);
      return true;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      const route = routes.find(
        ([pattern, verb]) => pattern.test(url) && verb === method
      );
      if (!route)
        return Response.json(
          { error: `no route for ${method} ${url}` },
          { status: 404 }
        );
      return Response.json(route[2]);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const run = (...args: string[]) =>
    runCli(['tasks', ...args, '--json', '--no-update-check']);
  const comment = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    task_id: TASK,
    author: { id: 'u1', display_name: 'Me', avatar_url: null },
    external_author: null,
    external_url: null,
    body: 'hello',
    created_at: '2024-01-01T00:00:00Z',
    edited_at: null,
    ...over,
  });

  it('adds a comment from an argument, a flag and a file', async () => {
    routes.push([/\/comments$/u, 'POST', { comment: comment() }]);
    await run('comment', 'add', TASK, 'Reproduced', 'on', 'staging');
    await run('comment', 'add', TASK, '--body', 'from flag');
    const file = join(
      await mkdtemp(join(tmpdir(), 'tuturuuu-cli-body-')),
      'c.md'
    );
    await writeFile(file, 'from file');
    await run('comment', 'add', TASK, '--body-file', file);
    expect(calls.map((c) => c.body)).toEqual([
      { body: 'Reproduced on staging' },
      { body: 'from flag' },
      { body: 'from file' },
    ]);
    expect(calls[0]?.url).toBe(`${TASKS_API}/tasks/${TASK}/comments`);
  });

  it('refuses an empty comment before calling the API', async () => {
    await expect(run('comment', 'add', TASK)).rejects.toThrow(
      'Missing comment text'
    );
    expect(calls).toHaveLength(0);
  });

  it('lists, edits and removes comments', async () => {
    routes.push(
      [
        /\/comments(\?|$)/u,
        'GET',
        {
          comments: [
            comment(),
            comment({ id: 'c2', author: null, external_author: 'octocat' }),
          ],
          nextCursor: null,
        },
      ],
      [/\/comments\/c1$/u, 'PATCH', { comment: comment({ body: 'edited' }) }],
      [/\/comments\/c1$/u, 'DELETE', { success: true }]
    );
    await run('comment', 'list', TASK);
    expect(JSON.parse(out).comments).toHaveLength(2);
    await run('comment', 'edit', TASK, 'c1', 'edited');
    await run('comment', 'rm', TASK, 'c1');
    expect(calls.map((c) => [c.method, c.body])).toEqual([
      ['GET', undefined],
      ['PATCH', { body: 'edited' }],
      ['DELETE', undefined],
    ]);
  });

  it('follows comment pages only with --all', async () => {
    routes.push([
      /\/comments/u,
      'GET',
      { comments: [comment()], nextCursor: 'next' },
    ]);
    await run('comment', 'list', TASK);
    expect(calls).toHaveLength(1);
    calls.length = 0;
    routes.length = 0;
    let page = 0;
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      calls.push({ url: String(input), method: 'GET', body: undefined });
      page += 1;
      return Response.json({
        comments: [comment({ id: `c${page}` })],
        nextCursor: page < 3 ? `cursor-${page}` : null,
      });
    });
    await run('comment', 'list', TASK, '--all');
    expect(calls).toHaveLength(3);
    expect(calls[1]?.url).toContain('cursor=cursor-1');
  });

  it('adds links with a URL and optional fields, and lists them', async () => {
    const link = {
      id: 'l1',
      kind: 'pull_request',
      provider: 'github',
      url: 'https://github.com/o/r/pull/9',
      external_id: 'o/r#9',
      title: 'Fix',
      state: 'merged',
      created_at: null,
      created_by: null,
    };
    routes.push(
      [/\/links$/u, 'POST', { link }],
      [/\/links$/u, 'GET', { links: [link] }]
    );
    await run(
      'link',
      'add',
      TASK,
      'https://github.com/o/r/pull/9',
      '--title',
      'Fix',
      '--state',
      'merged'
    );
    expect(calls[0]).toMatchObject({
      method: 'POST',
      body: {
        url: 'https://github.com/o/r/pull/9',
        title: 'Fix',
        state: 'merged',
      },
    });
    await run('link', 'list', TASK);
    expect(
      JSON.parse(out.slice(out.indexOf('{\n  "links"'))).links[0].kind
    ).toBe('pull_request');
  });

  it('removes a link by id or by URL and points legacy entries at --links-json', async () => {
    const rich = {
      id: 'l1',
      kind: 'url',
      provider: 'web',
      url: 'https://example.com/a',
      external_id: null,
      title: null,
      state: null,
      created_at: null,
      created_by: null,
    };
    const legacy = {
      ...rich,
      id: null,
      url: 'https://example.com/legacy',
      legacy: true,
    };
    routes.push(
      [/\/links$/u, 'GET', { links: [rich, legacy] }],
      [/\/links\/l1$/u, 'DELETE', { success: true }]
    );
    await run('link', 'rm', TASK, 'https://example.com/a');
    await run('link', 'rm', TASK, 'l1');
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(2);
    await expect(
      run('link', 'rm', TASK, 'https://example.com/legacy')
    ).rejects.toThrow('--links-json');
    await expect(run('link', 'rm', TASK, 'nope')).rejects.toThrow(
      'No linked resource'
    );
  });

  it('prints the timeline', async () => {
    routes.push([
      /\/timeline/u,
      'GET',
      {
        events: [
          {
            id: 'e1',
            type: 'external_event',
            at: '2023-05-02T07:00:00Z',
            actor: null,
            external_actor: 'octocat',
            field_name: 'external',
            old_value: 'open',
            new_value: 'closed',
            metadata: { event: 'closed' },
          },
        ],
        nextCursor: null,
      },
    ]);
    await run('timeline', TASK);
    expect(JSON.parse(out).events[0].external_actor).toBe('octocat');
  });

  describe('status', () => {
    const fleet = [
      {
        id: 'l-waiting',
        name: 'Waiting on USER',
        status: 'not_started',
        position: 5,
      },
      { id: 'l-queued', name: 'Queued', status: 'not_started', position: 0 },
      { id: 'l-live', name: 'Live Today', status: 'active', position: 1 },
      {
        id: 'l-review',
        name: 'Needs User / Review',
        status: 'review',
        position: 2,
      },
      { id: 'l-done', name: 'Done', status: 'done', position: 3 },
      {
        id: 'l-closed',
        name: 'Archived / Closed',
        status: 'closed',
        position: 4,
      },
    ];

    function mockBoard(listId: string, extra: Record<string, unknown> = {}) {
      routes.push(
        [
          new RegExp(`/tasks/${TASK}$`, 'u'),
          'GET',
          { task: { id: TASK, board_id: BOARD, list_id: listId } },
        ],
        [
          new RegExp(`/task-boards/${BOARD}$`, 'u'),
          'GET',
          {
            board: {
              id: BOARD,
              task_lists: fleet,
              default_done_list_id: null,
              default_closed_list_id: null,
              ...extra,
            },
          },
        ],
        [/\/move$/u, 'POST', { task: { id: TASK } }]
      );
    }

    it.each([
      ['todo', 'l-queued'],
      ['backlog', 'l-queued'],
      ['in-progress', 'l-live'],
      ['review', 'l-review'],
      ['done', 'l-done'],
      ['cancelled', 'l-closed'],
    ])(
      'resolves %s to the board list %s without board defaults',
      async (status, listId) => {
        mockBoard('l-other');
        await run('status', TASK, status);
        const move = calls.find((c) => c.url.endsWith('/move'));
        expect(move?.body).toEqual({ list_id: listId });
      }
    );

    it('uses the board defaults for done and cancelled when set', async () => {
      mockBoard('l-other', {
        default_done_list_id: 'l-done',
        default_closed_list_id: 'l-closed',
      });
      await run('status', TASK, 'cancelled');
      expect(calls.find((c) => c.url.endsWith('/move'))?.body).toEqual({
        list_id: 'l-closed',
      });
    });

    it('does not move a task already in the target list', async () => {
      mockBoard('l-queued');
      await run('status', TASK, 'todo');
      expect(calls.some((c) => c.url.endsWith('/move'))).toBe(false);
      expect(JSON.parse(out).changed).toBe(false);
    });

    it('rejects unknown statuses', async () => {
      await expect(run('status', TASK, 'blocked')).rejects.toThrow(
        'Usage: ttr tasks status'
      );
      expect(calls).toHaveLength(0);
    });
  });
});
