import { afterEach, expect, it, vi } from 'vitest';
import { TuturuuuUserClient } from '../platform';
import { runTaskDescriptionCommand } from './task-description';

const taskId = '2fdd6621-55da-4cc2-883e-540efa132d47';
const historyId = 'c6f91928-9754-479a-ba46-26fd4cbfc682';
const baseUrl = 'https://tasks.example.test';

function setup(action: string, flags: Record<string, string | boolean> = {}) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(Response.json({ marker: 'task-history-fixture' }));
  const client = new TuturuuuUserClient({
    accessToken: 'test-token',
    baseUrl,
    tasksBaseUrl: baseUrl,
    fetch,
  });
  return {
    fetch,
    run: () =>
      runTaskDescriptionCommand({
        client,
        config: { baseUrl },
        flags,
        json: true,
        positionals: [
          'tasks',
          'description',
          action,
          taskId,
          ...(action === 'history' ? [] : [historyId]),
        ],
        workspaceId: 'workspace',
      }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

it.each([
  ['history', '/history'],
  ['snapshot', `/snapshot/${historyId}`],
])('reads description %s through the task API', async (action, suffix) => {
  const { fetch, run } = setup(action, { limit: '25', offset: '50' });
  const write = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);

  await run();

  expect(fetch).toHaveBeenCalledTimes(1);
  const [input, init] = fetch.mock.calls[0] ?? [];
  const url = new URL(String(input));
  expect(url.origin).toBe(baseUrl);
  expect(url.pathname).toBe(
    `/api/v1/workspaces/workspace/tasks/${taskId}${suffix}`
  );
  expect(init?.method ?? 'GET').toBe('GET');
  expect(Object.fromEntries(url.searchParams)).toEqual(
    action === 'history'
      ? { field_name: 'description', limit: '25', offset: '50' }
      : {}
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('task-history-fixture')
  );
});

it('refuses restore before making any task API request', async () => {
  const { fetch, run } = setup('restore');
  await expect(run()).rejects.toThrow('Description restore is coming soon');
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ['limit', '0'],
  ['offset', '-1'],
  ['offset', true],
])(
  'rejects invalid pagination before making an API request (%o)',
  async (flag, value) => {
    const { fetch, run } = setup('history', { [flag]: value });
    await expect(run()).rejects.toThrow(
      /--(?:limit|offset) must be an integer/
    );
    expect(fetch).not.toHaveBeenCalled();
  }
);
