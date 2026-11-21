import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runCli } from './commands';

const api = 'https://tasks.example.test';
const boardId = '11111111-1111-4111-8111-111111111111';
const taskId = '22222222-2222-4222-8222-222222222222';
const boardPath = `/api/v1/workspaces/team/task-boards/${boardId}`;
const workspaceTasksPath = '/api/v1/workspaces/team/tasks';
const fetch = vi.fn<typeof globalThis.fetch>();
const stdout = vi.fn();
let configDir: string;

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'ttr-board-key-'));
  const configPath = join(configDir, 'config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      baseUrl: api,
      tasksBaseUrl: api,
      currentWorkspaceId: 'team',
      currentBoardId: 'saved-board',
      currentListId: 'saved-list',
      session: { accessToken: 'test-token', refreshToken: 'test-refresh' },
    })
  );
  fetch.mockReset().mockRejectedValue(new Error('Unexpected API request'));
  stdout.mockReset();
  vi.stubEnv('TUTURUUU_CONFIG', configPath);
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout(chunk);
    return true;
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(configDir, { recursive: true, force: true });
});

function run(...args: string[]) {
  return runCli([...args, '--no-update-check']);
}

function boardResponse(key: string | null) {
  return Response.json({ board: { id: boardId, ticket_prefix: key } });
}

it('shows the current board key without making a write', async () => {
  fetch.mockResolvedValueOnce(boardResponse('F'));

  await run('boards', 'key', boardId);

  expect(stdout).toHaveBeenCalledWith('F\n');
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    api + boardPath,
    expect.objectContaining({ headers: expect.any(Headers) })
  );
  expect(fetch.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
});

it('reports a missing key as null in JSON', async () => {
  fetch.mockResolvedValueOnce(boardResponse(null));

  await run('boards', 'key', boardId, '--json');

  expect(JSON.parse(stdout.mock.calls[0]?.[0] ?? '')).toEqual({
    board_id: boardId,
    ticket_prefix: null,
  });
});

it('sets the key in the explicit workspace and reads it back', async () => {
  fetch
    .mockResolvedValueOnce(Response.json({ message: 'success' }))
    .mockResolvedValueOnce(boardResponse('F-OPS_2'));
  const url = api + boardPath.replace('/team/', '/other-team/');

  await run(
    'boards',
    'key',
    boardId,
    '--set',
    ' f-ops_2 ',
    '--workspace',
    'other-team'
  );

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenNthCalledWith(
    1,
    url,
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ ticket_prefix: 'F-OPS_2' }),
    })
  );
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    url,
    expect.objectContaining({ headers: expect.any(Headers) })
  );
  expect(fetch.mock.calls[1]?.[1]?.method ?? 'GET').toBe('GET');
  expect(stdout).toHaveBeenCalledWith('F-OPS_2\n');
});

it('surfaces reserved-key errors without printing success', async () => {
  fetch.mockResolvedValueOnce(
    Response.json({ error: 'Board key is already in use' }, { status: 409 })
  );

  await expect(run('boards', 'key', boardId, '--set', 'F')).rejects.toThrow(
    'Board key is already in use'
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(stdout).not.toHaveBeenCalled();
});

it('fails if the update reports success but the saved key differs', async () => {
  fetch
    .mockResolvedValueOnce(Response.json({ message: 'success' }))
    .mockResolvedValueOnce(boardResponse('OPS'));

  await expect(run('boards', 'key', boardId, '--set', 'F')).rejects.toThrow(
    'Could not verify the board key'
  );
  expect(stdout).not.toHaveBeenCalled();
});

it('distinguishes a failed readback from a rejected update', async () => {
  fetch
    .mockResolvedValueOnce(Response.json({ message: 'success' }))
    .mockRejectedValueOnce(new Error('Connection lost'));

  await expect(run('boards', 'key', boardId, '--set', 'F')).rejects.toThrow(
    'The board key update returned success, but verification failed'
  );
  expect(stdout).not.toHaveBeenCalled();
});

it.each([['--set'], ['--set', '   ']])(
  'rejects a missing key value without sending a write (%j)',
  async (...flags) => {
    await expect(run('boards', 'key', boardId, ...flags)).rejects.toThrow(
      '--set requires a non-empty board key'
    );
    expect(fetch).not.toHaveBeenCalled();
  }
);

it('resolves a ticket key to a task UUID and displays the ticket', async () => {
  const task = { id: taskId, name: 'Review fleet tasks' };
  fetch
    .mockResolvedValueOnce(Response.json({ tasks: [task] }))
    .mockResolvedValueOnce(
      Response.json({
        task: { ...task, ticket_prefix: 'F', display_number: 12 },
      })
    );

  await run('tasks', 'get', 'F-12');

  expect(fetch).toHaveBeenCalledTimes(2);
  const lookup = new URL(String(fetch.mock.calls[0]?.[0]));
  expect(lookup.origin + lookup.pathname).toBe(api + workspaceTasksPath);
  expect(lookup.searchParams.get('identifier')).toBe('F-12');
  expect(lookup.searchParams.has('boardId')).toBe(false);
  expect(lookup.searchParams.has('listId')).toBe(false);
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    `${api}${workspaceTasksPath}/${taskId}`,
    expect.objectContaining({ headers: expect.any(Headers) })
  );
  expect(fetch.mock.calls[1]?.[1]?.method ?? 'GET').toBe('GET');
  expect(stdout.mock.calls.flat().join('')).toContain('F-12');
  expect(stdout.mock.calls.flat().join('')).toContain(task.name);
});
