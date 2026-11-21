import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './commands';

const taskId = '11111111-1111-4111-8111-111111111111';
const blockerId = '22222222-2222-4222-8222-222222222222';
const listId = '33333333-3333-4333-8333-333333333333';
const blocker = { id: blockerId, name: 'Review\x1b[31m' };
const fields = {
  virtual_assignees: [
    { key: 'iris', kind: 'agent', position: 0 },
    { key: 'selene', kind: 'agent', position: 1 },
  ],
  needs_user: true,
  needs_user_reason: 'Approve scope',
  task_resources: [
    { kind: 'link', url: 'https://example.test/run,a', title: 'Run' },
  ],
};
const task = {
  id: taskId,
  name: 'Publish',
  updated_at: '2026-11-21T01:00:00Z',
  ...fields,
};
const run = (...args: string[]) =>
  runCli(['tasks', ...args, '--no-update-check']);

describe('task fleet fields commands', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ttr-fleet-fields-'));
    const configPath = join(dir, 'config.json');
    vi.stubEnv('TUTURUUU_CONFIG', configPath);
    await writeFile(
      configPath,
      JSON.stringify({
        baseUrl: 'https://tuturuuu.com',
        currentWorkspaceId: 'ws-1',
        session: { accessToken: 'test-token', refreshToken: 'test-refresh' },
      })
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(dir, { force: true, recursive: true });
  });

  it('creates native fields, creates an incoming blocker and prints JSON', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ task }))
      .mockResolvedValueOnce(Response.json({ blockedBy: [] }))
      .mockResolvedValueOnce(Response.json({ relationship: {} }))
      .mockResolvedValueOnce(Response.json({ blockedBy: [blocker] }));

    await run(
      'create',
      'Publish',
      '--list',
      listId,
      '--agent-owners',
      'iris,selene,iris',
      '--needs-user',
      'true',
      '--needs-user-reason',
      'Approve scope',
      '--links-json',
      '[{"url":"https://example.test/run,a","title":"Run"}]',
      '--blocked-by',
      blockerId,
      '--json'
    );

    expect(fetch.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject(
      fields
    );
    expect(fetch.mock.calls[2]?.[0]).toEqual(
      expect.stringContaining(`/tasks/${taskId}/relationships`)
    );
    expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({
      source_task_id: blockerId,
      target_task_id: taskId,
      type: 'blocks',
    });
    expect(JSON.parse(String(write.mock.lastCall?.[0]))).toEqual({
      task: { ...task, blocked_by: [blocker] },
    });
  });

  it('reports the created task ID when blocker readback fails', async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ task }))
      .mockResolvedValueOnce(Response.json({ blockedBy: [] }))
      .mockResolvedValueOnce(Response.json({ relationship: {} }))
      .mockResolvedValueOnce(
        Response.json({ error: 'Unavailable' }, { status: 503 })
      );

    await expect(
      run(
        'create',
        'Publish',
        '--list',
        listId,
        '--blocked-by',
        blockerId,
        '--json'
      )
    ).rejects.toThrow(
      `Task ${taskId} exists. Blocker changes could not be confirmed.`
    );
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('clears fields on update and removes only the incoming blocker', async () => {
    const cleared = {
      ...task,
      needs_user: false,
      needs_user_reason: null,
      task_resources: [],
      virtual_assignees: [],
    };
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ task: cleared }))
      .mockResolvedValueOnce(Response.json({ blockedBy: [blocker] }))
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ blockedBy: [] }));

    await run(
      'update',
      taskId,
      '--agent-owners=',
      '--links-json=[]',
      '--needs-user=false',
      '--needs-user-reason=',
      '--remove-blocked-by',
      blockerId,
      '--json'
    );

    expect(fetch.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      needs_user: false,
      needs_user_reason: null,
      task_resources: [],
      virtual_assignees: [],
    });
    expect(fetch.mock.calls[2]?.[1]?.method).toBe('DELETE');
    expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({
      source_task_id: blockerId,
      target_task_id: taskId,
      type: 'blocks',
    });
    expect(JSON.parse(String(write.mock.lastCall?.[0]))).toEqual({
      task: { ...cleared, blocked_by: [] },
    });
  });

  it('skips creating a blocker that is already present', async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ task }))
      .mockResolvedValueOnce(Response.json({ blockedBy: [blocker] }))
      .mockResolvedValueOnce(Response.json({ blockedBy: [blocker] }));

    await run('update', taskId, '--blocked-by', blockerId, '--json');

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      fetch.mock.calls.every(
        ([, init]) => !init?.method || init.method === 'GET'
      )
    ).toBe(true);
  });

  it('shows native fields and escapes blocker names in terminal output', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ task }))
      .mockResolvedValueOnce(Response.json({ blockedBy: [blocker] }));
    await run('show', taskId);
    const output = write.mock.calls.map(([line]) => String(line)).join('');
    expect(output).toContain('Agent owners: iris, selene');
    expect(output).toContain('Needs user: yes');
    expect(output).toContain('Needs user reason: Approve scope');
    expect(output).toContain('Links: Run (https://example.test/run,a)');
    expect(output).toContain('Blocked by: Review');
    expect(output).not.toContain(blocker.name);
    expect(output).toContain(`Updated at: ${task.updated_at}`);
  });

  it('rejects URLs that exceed the API limit once percent encoded', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const links = JSON.stringify([
      { url: `https://example.test/${'é'.repeat(400)}` },
    ]);
    await expect(
      run(
        'create',
        'Publish',
        '--list',
        listId,
        '--links-json',
        links,
        '--json'
      )
    ).rejects.toThrow('up to 2048 characters');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['--needs-user=typo', /requires true or false/],
    ['--links-json=[{"url":"file:///tmp/example"}]', /HTTP\(S\)/],
    ['--blocked-by=not-a-uuid', /requires comma-separated task UUIDs/],
  ])('rejects invalid input %s before writing', async (flag, message) => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(
      run('create', 'Publish', '--list', listId, flag, '--json')
    ).rejects.toThrow(message);
    expect(fetch).not.toHaveBeenCalled();
  });
});
