import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  removeUnreferencedTaskMedia: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    storage: { from: () => ({ list: mocks.list }) },
  })),
}));
vi.mock('@/lib/task-media-cleanup', () => ({
  taskMediaFilename: (path: string) =>
    path.endsWith('.png') ? 'clipboard.png' : null,
  removeUnreferencedTaskMedia: mocks.removeUnreferencedTaskMedia,
}));

const workspaceId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  process.env.CRON_SECRET = 'test-only-secret';
  mocks.list.mockReset();
  mocks.removeUnreferencedTaskMedia.mockReset();
  mocks.removeUnreferencedTaskMedia.mockResolvedValue(true);
  mocks.list.mockImplementation(async (prefix: string) => ({
    data:
      prefix === ''
        ? [{ id: null, name: workspaceId }]
        : prefix === `${workspaceId}/task-images`
          ? [
              { id: 'old', name: 'old.png', created_at: '2025-01-01' },
              {
                id: 'new',
                name: 'new.png',
                created_at: new Date().toISOString(),
              },
            ]
          : [],
    error: null,
  }));
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

it('requires the cron secret before reading storage', async () => {
  const { GET } = await import('./route');
  const response = await GET(new NextRequest('https://tasks.test/api/cron'));
  expect(response.status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled();
});

it('only checks media older than the retention period', async () => {
  const { GET } = await import('./route');
  const response = await GET(
    new NextRequest('https://tasks.test/api/cron', {
      headers: { Authorization: 'Bearer test-only-secret' },
    })
  );
  expect(response.status).toBe(200);
  expect(mocks.removeUnreferencedTaskMedia).toHaveBeenCalledTimes(1);
  expect(mocks.removeUnreferencedTaskMedia).toHaveBeenCalledWith(
    expect.anything(),
    `${workspaceId}/task-images/old.png`
  );
});
