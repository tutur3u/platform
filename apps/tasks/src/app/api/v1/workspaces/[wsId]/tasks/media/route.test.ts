import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  containsPermission: vi.fn(),
  removeUnreferencedTaskMedia: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: vi.fn(
    async () => '22222222-2222-4222-8222-222222222222'
  ),
  getPermissions: vi.fn(async () => ({
    containsPermission: mocks.containsPermission,
  })),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
}));
vi.mock('@/lib/task-media-cleanup', () => ({
  taskMediaFilename: (path: string) =>
    path.endsWith('_clipboard.png') ? 'filename' : null,
  removeUnreferencedTaskMedia: mocks.removeUnreferencedTaskMedia,
}));

const workspaceId = '22222222-2222-4222-8222-222222222222';
const filename =
  '1750000000000_11111111-1111-4111-8111-111111111111_clipboard.png';
const authContext = { user: { id: 'user' }, supabase: {} };

async function request(paths: string[]) {
  const { DELETE } = await import('./route');
  const handler = DELETE as unknown as (
    request: NextRequest,
    context: typeof authContext,
    params: { wsId: string }
  ) => Promise<Response>;
  return handler(
    new NextRequest('https://tasks.test/api/tasks/media', {
      method: 'DELETE',
      body: JSON.stringify({ paths }),
    }),
    authContext,
    { wsId: workspaceId }
  );
}

beforeEach(() => {
  mocks.containsPermission.mockReset();
  mocks.removeUnreferencedTaskMedia.mockReset();
  mocks.containsPermission.mockReturnValue(true);
  mocks.removeUnreferencedTaskMedia.mockResolvedValue(true);
});

it('requires task media permission', async () => {
  mocks.containsPermission.mockReturnValue(false);
  expect((await request([`task-images/${filename}`])).status).toBe(403);
  expect(mocks.removeUnreferencedTaskMedia).not.toHaveBeenCalled();
});

it('rejects paths outside new-task uploads', async () => {
  expect((await request([`task-images/task-id/${filename}`])).status).toBe(400);
  expect((await request([`../invoices/${filename}`])).status).toBe(400);
  expect(mocks.removeUnreferencedTaskMedia).not.toHaveBeenCalled();
});

it('removes unreferenced media from the requested workspace', async () => {
  expect((await request([`task-images/${filename}`])).status).toBe(200);
  expect(mocks.removeUnreferencedTaskMedia).toHaveBeenCalledWith(
    {},
    `${workspaceId}/task-images/${filename}`
  );
});
