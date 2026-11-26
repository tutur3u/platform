import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(async () => ({})),
  runTaskMediaCleanup: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/task-media-cleanup-run', async (actual) => ({
  ...(await actual<typeof import('@/lib/task-media-cleanup-run')>()),
  runTaskMediaCleanup: mocks.runTaskMediaCleanup,
}));

const authorized = () =>
  new NextRequest('https://tasks.test/api/cron', {
    headers: { Authorization: 'Bearer test-only-secret' },
  });

beforeEach(() => {
  process.env.CRON_SECRET = 'test-only-secret';
  mocks.createAdminClient.mockClear();
  mocks.runTaskMediaCleanup.mockReset();
  mocks.runTaskMediaCleanup.mockResolvedValue({
    mode: 'dry-run',
    checked: 1,
    deleted: 1,
    failed: 0,
    listCalls: 2,
    capped: false,
  });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.TASKS_MEDIA_CLEANUP_MODE;
});

it('requires the cron secret before reading storage', async () => {
  const { GET } = await import('./route');
  const response = await GET(new NextRequest('https://tasks.test/api/cron'));
  expect(response.status).toBe(401);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
});

it('counts only, by default, without a delete mode', async () => {
  const { GET } = await import('./route');
  const response = await GET(authorized());
  expect(response.status).toBe(200);
  expect(mocks.runTaskMediaCleanup).toHaveBeenCalledWith(expect.anything(), {
    mode: 'dry-run',
  });
  expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
});

it.each([
  ['delete', 'delete'],
  ['DELETE', 'dry-run'],
  [' delete', 'dry-run'],
])('mode %j runs as %s', async (value, mode) => {
  process.env.TASKS_MEDIA_CLEANUP_MODE = value;
  const { GET } = await import('./route');
  await GET(authorized());
  expect(mocks.runTaskMediaCleanup).toHaveBeenCalledWith(expect.anything(), {
    mode,
  });
});

it('stops before reading storage when the job is switched off', async () => {
  process.env.TASKS_MEDIA_CLEANUP_MODE = 'off';
  const { GET } = await import('./route');
  const response = await GET(authorized());
  expect(await response.json()).toEqual({ mode: 'off' });
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
  expect(mocks.runTaskMediaCleanup).not.toHaveBeenCalled();
});

it('reports a capped pass as success and logs every pass', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const report = {
    mode: 'delete',
    checked: 500,
    deleted: 12,
    removable: 0,
    failed: 0,
    listCalls: 40,
    capped: 'checked',
  };
  mocks.runTaskMediaCleanup.mockResolvedValueOnce(report);
  const { GET } = await import('./route');
  const response = await GET(authorized());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(report);
  expect(info).toHaveBeenCalledWith('Task media cleanup pass', report);
  info.mockRestore();
});

it('reports a pass with failed files as a failure', async () => {
  mocks.runTaskMediaCleanup.mockResolvedValueOnce({
    mode: 'delete',
    checked: 2,
    deleted: 1,
    failed: 1,
    listCalls: 2,
    capped: false,
  });
  const { GET } = await import('./route');
  expect((await GET(authorized())).status).toBe(500);
});
