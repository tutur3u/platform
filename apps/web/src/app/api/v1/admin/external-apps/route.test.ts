import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  permissions: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  rotate: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: vi.fn(async () => {
    const {
      data: { user },
      error,
    } = await mocks.getUser();
    return error || !user
      ? {
          ok: false,
          response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
        }
      : { ok: true, user, supabase: {} };
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  listExternalApps: mocks.list,
  upsertExternalApp: mocks.save,
  rotateExternalAppSecret: mocks.rotate,
}));

import { GET, POST } from './route';

const app = {
  action: 'save',
  id: 'rennu',
  displayName: 'Ren',
  enabled: true,
  origins: ['https://rennu.ttr.gg'],
  allowedScopes: ['external-projects:read'],
  allowedWorkspaceIds: ['2e627dd0-3b4b-472e-b6de-3fb4b767a775'],
};
const request = (body: unknown) =>
  new Request('https://tuturuuu.com/api/v1/admin/external-apps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'owner' } },
    error: null,
  });
  mocks.permissions.mockResolvedValue({
    containsPermission: (p: string) => p === 'manage_workspace_secrets',
  });
  mocks.list.mockResolvedValue([]);
  mocks.save.mockResolvedValue({ app, secret: null });
});
describe('CLI external registry authorization', () => {
  it('rejects missing sessions and non-root users before reading or mutating', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(request({}))).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'member' } } });
    mocks.permissions.mockResolvedValue({ containsPermission: () => false });
    expect((await POST(request(app))).status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('requires explicit workspace and scope lists; cannot issue secrets through save', async () => {
    expect((await POST(request({ ...app, issueSecret: true }))).status).toBe(
      400
    );
    expect(
      (await POST(request({ ...app, allowedWorkspaceIds: [] }))).status
    ).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
    const response = await POST(request(app));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'owner' })
    );
  });
  it('only returns a new secret for an explicit rotation action', async () => {
    mocks.rotate.mockResolvedValue({ app, secret: 'test-only-secret' });
    const response = await POST(
      request({ action: 'rotate-secret', id: 'rennu' })
    );
    expect(response.status).toBe(200);
    expect(mocks.rotate).toHaveBeenCalledWith({
      actorUserId: 'owner',
      appId: 'rennu',
    });
  });
});
