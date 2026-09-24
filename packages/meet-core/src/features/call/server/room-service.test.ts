import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const single = vi.fn();
  const query = { select: vi.fn(), eq: vi.fn(), single };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return { query, single, from: vi.fn(() => query) };
});
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: mocks.from }),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: class extends Error {},
}));
vi.mock('../lib/call-access', () => ({
  getMeetCallAccess: vi.fn(),
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('../lib/call-session', () => ({ getMeetCallSession: vi.fn() }));

import { personalWorkspace } from './room-service';

beforeEach(() => vi.clearAllMocks());

it.each([false, null])(
  'resolves an active personal Drive with deleted=%s',
  async (deleted) => {
    mocks.single.mockResolvedValue({
      data: { id: 'personal-drive', deleted },
      error: null,
    });
    await expect(personalWorkspace('creator')).resolves.toBe('personal-drive');
    expect(mocks.from).toHaveBeenCalledWith('workspaces');
    expect(mocks.query.select).toHaveBeenCalledWith('id, deleted');
    expect(mocks.query.eq).toHaveBeenCalledWith('creator_id', 'creator');
    expect(mocks.query.eq).toHaveBeenCalledWith('personal', true);
  }
);

it.each([
  { data: { id: 'deleted-drive', deleted: true }, error: null },
  { data: null, error: null },
  { data: null, error: { message: 'database unavailable' } },
])('rejects unavailable or deleted personal Drives', async (result) => {
  mocks.single.mockResolvedValue(result);
  await expect(personalWorkspace('creator')).rejects.toMatchObject({
    status: 503,
  });
});
