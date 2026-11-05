// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTopicWorkspaceFixture,
  TEACHER_PLATFORM_ID,
  WS_ID,
} from '../../topic-announcement-fake-supabase.test-helper';

const mocks = vi.hoisted(() => ({
  admin: null as any,
  granted: new Set<string>(),
  upload: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => mocks.admin),
  createClient: vi.fn(async () => mocks.admin),
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: vi.fn(async () => ({
    ok: true,
    user: { id: TEACHER_PLATFORM_ID },
    supabase: mocks.admin,
  })),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(async () => ({
    withoutPermission: (permission: string) => !mocks.granted.has(permission),
  })),
  getSecret: vi.fn(() => ({ value: 'true' })),
  getSecrets: vi.fn(async () => [
    { name: 'ENABLE_TOPIC_ANNOUNCEMENTS', value: 'true' },
    { name: 'ENABLE_TOPIC_TEACHER_ASSIGNMENTS', value: 'true' },
  ]),
  normalizeWorkspaceId: vi.fn(async (wsId: string) => wsId),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  resolveWorkspaceStorageProvider: vi.fn(async () => ({ provider: 'r2' })),
  uploadWorkspaceStorageFileDirect: mocks.upload,
  WorkspaceStorageError: class extends Error {},
}));

const { POST } = await import('./route');

function upload() {
  const body = new FormData();
  body.set('file', new File([new Uint8Array([1, 2, 3])], 'page.png'));
  return POST(new Request('http://localhost', { body, method: 'POST' }), {
    params: Promise.resolve({ wsId: WS_ID }),
  });
}

beforeEach(() => {
  mocks.admin = createTopicWorkspaceFixture();
  mocks.granted = new Set();
  mocks.upload.mockReset();
  mocks.upload.mockResolvedValue({ path: 'topic-announcements/page.png' });
});

describe('topic announcement attachment upload', () => {
  it('rejects a create-only teacher, who could not attach the file', async () => {
    mocks.granted = new Set(['create_user_groups_posts']);

    expect((await upload()).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('allows a teacher with update_user_groups_posts, the attach permission', async () => {
    mocks.granted = new Set(['update_user_groups_posts']);

    expect((await upload()).status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledOnce();
  });

  it('keeps managers unchanged', async () => {
    mocks.granted = new Set(['manage_users']);

    expect((await upload()).status).toBe(201);
  });
});
