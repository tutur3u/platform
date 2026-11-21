import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBoardCommand } from './board-command';
import { runCli } from './commands';

const channel = '60000000-0000-4000-8000-000000000001';
const task = '60000000-0000-4000-8000-000000000002';
const requestId = '60000000-0000-4000-8000-000000000003';
const prerequisite = '60000000-0000-4000-8000-000000000004';
const workspace = '60000000-0000-4000-8000-000000000005';
const origin = 'https://fleet-board.example.test';
const token = 'A'.repeat(43) + '=';
const assertion = 'aW5wdXQ=.dGVzdA==';

async function* credentials(options: { token?: string } = {}) {
  yield JSON.stringify({ assertion, ...options });
}

describe('ttr board', () => {
  const call = vi.fn<typeof fetch>();
  const write = vi.fn(() => true);

  beforeEach(() => {
    call.mockReset();
    write.mockClear();
    call.mockImplementation(async () =>
      Response.json({ items: [], nextCursor: null })
    );
    vi.stubGlobal('fetch', call);
    vi.stubEnv('TUTURUUU_BOARD_URL', origin);
    vi.spyOn(process.stdout, 'write').mockImplementation(write);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('registers help without requiring credentials or network', async () => {
    await runCli(['board', '--help']);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('add-follow-up')
    );
    expect(call).not.toHaveBeenCalled();
  });

  it.each([
    { args: ['list'], path: '/board/channels' },
    {
      args: ['list', '--channel', channel, '--limit', '3', '--cursor', 'a+/='],
      path: `/board/channels/${channel}/threads?limit=3&cursor=a%2B%2F%3D`,
    },
    {
      args: ['show', task, '--channel', channel],
      path: `/board/channels/${channel}/threads/${task}/messages`,
    },
  ])('makes one signed read for $path', async ({ args, path }) => {
    await runBoardCommand(args, credentials());

    expect(call).toHaveBeenCalledTimes(1);
    const [url, init] = call.mock.calls[0] ?? [];
    expect(url).toBe(origin + path);
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Board-Assertion')).toBe(assertion);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('Idempotency-Key')).toBe(false);
    expect(write).toHaveBeenCalledWith('{"items":[],"nextCursor":null}\n');
  });

  it.each([
    {
      args: ['claim', '--ttl-ms', '45000'],
      path: 'leases/claim',
      body: '{"ttlMs":45000}',
    },
    {
      args: ['claim'],
      path: 'leases/claim',
      body: '{}',
    },
    {
      args: ['release', task],
      path: `leases/${task}/release`,
      body: JSON.stringify({ token }),
    },
    {
      args: ['add-follow-up', task, '--due-at-ms', '1795650000000'],
      path: `threads/${task}/followups`,
      body: '{"dueAt":1795650000000,"kind":"verify_task","payload":{"expected":"done"}}',
    },
  ])(
    'preserves signed body bytes and idempotency for $path',
    async ({ args, path, body }) => {
      await runBoardCommand(
        [...args, '--channel', channel, '--request-id', requestId],
        credentials(path.endsWith('/release') ? { token } : {})
      );

      expect(call).toHaveBeenCalledTimes(1);
      const [url, init] = call.mock.calls[0] ?? [];
      expect(url).toBe(`${origin}/board/channels/${channel}/${path}`);
      expect(init).toMatchObject({ method: 'POST', body, redirect: 'error' });
      const headers = new Headers(init?.headers);
      expect(headers.get('Idempotency-Key')).toBe(requestId);
      expect(headers.get('X-Board-Assertion')).toBe(assertion);
    }
  );

  it('creates the prerequisite edge through the authenticated Tasks client', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ttr-board-test-'));
    const config = join(dir, 'config.json');
    const tasksOrigin = 'https://tasks.tuturuuu.com';
    vi.stubEnv('TUTURUUU_CONFIG', config);
    const result = { relationship: { type: 'blocks' } };
    call.mockResolvedValueOnce(Response.json(result));
    try {
      await writeFile(
        config,
        JSON.stringify({
          baseUrl: 'https://tuturuuu.com',
          tasksBaseUrl: tasksOrigin,
          session: {
            accessToken: 'fixture-access',
            refreshToken: 'fixture-refresh',
          },
        })
      );
      await runCli([
        'board',
        'add-dependency',
        task,
        prerequisite,
        '--workspace',
        workspace,
        '--no-update-check',
      ]);

      expect(call).toHaveBeenCalledTimes(1);
      const [url, init] = call.mock.calls[0] ?? [];
      expect(String(url)).toBe(
        `${tasksOrigin}/api/v1/workspaces/${workspace}/tasks/${task}/relationships`
      );
      expect(init).toMatchObject({
        method: 'POST',
        body: JSON.stringify({
          source_task_id: prerequisite,
          target_task_id: task,
          type: 'blocks',
        }),
      });
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer fixture-access');
      expect(headers.has('X-Board-Assertion')).toBe(false);
      expect(write).toHaveBeenCalledWith(
        `${JSON.stringify(result, null, 2)}\n`
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prints the lease exactly when a claim succeeds', async () => {
    const result = { lease: { taskId: task, expiresAt: 1795650000000, token } };
    call.mockResolvedValueOnce(Response.json(result));

    await runBoardCommand(
      ['claim', '--channel', channel, '--request-id', requestId],
      credentials()
    );

    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result)}\n`);
  });

  it('fails before network without the lease token', async () => {
    await expect(
      runBoardCommand(
        ['release', task, '--channel', channel, '--request-id', requestId],
        credentials()
      )
    ).rejects.toThrow('Release requires the lease token');
    expect(call).not.toHaveBeenCalled();
  });

  it.each([
    [
      'claim',
      '--channel',
      channel,
      '--request-id',
      requestId,
      '--ttl-ms',
      '600001',
    ],
    ['list', '--limit', '1e2'],
    ['list', '--channel', '../control/stop'],
    ['claim', '--channel', channel],
    ['add-dependency', task, task, '--workspace', workspace],
    ['add-follow-up', task, '--channel', channel, '--request-id', requestId],
  ])('rejects invalid input before network (%j)', async (...args) => {
    await expect(runBoardCommand(args, credentials())).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('refuses a non-HTTPS origin before reading credentials', async () => {
    vi.stubEnv('TUTURUUU_BOARD_URL', 'http://board.example.test');
    await expect(runBoardCommand(['list'], credentials())).rejects.toThrow(
      'HTTPS'
    );
    expect(call).not.toHaveBeenCalled();
  });

  it('preserves reconciliation guidance after an ambiguous gateway response', async () => {
    call.mockResolvedValueOnce(new Response(assertion, { status: 504 }));
    await expect(
      runBoardCommand(
        ['claim', '--channel', channel, '--request-id', requestId],
        credentials()
      )
    ).rejects.toThrow(
      'HTTP 504). Write outcome is unknown. Reconcile using the same request ID.'
    );
    expect(call).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });

  it('reports a transport failure without retrying or printing secret data', async () => {
    call.mockRejectedValueOnce(new Error(assertion));
    await expect(
      runBoardCommand(
        ['claim', '--channel', channel, '--request-id', requestId],
        credentials()
      )
    ).rejects.toThrow('Reconcile using the same request ID');
    expect(call).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });
});
