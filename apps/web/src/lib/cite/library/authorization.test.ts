import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeCitationLibrary } from './authorization';

const mocks = vi.hoisted(() => ({
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  getPermissions: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => mocks);

const wsId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const request = new NextRequest('https://tuturuuu.com/api/v1/x');
const auth = { supabase: {}, user: { id: actorId } } as never;
const permissions = (denied: string[] = []) => ({
  withoutPermission: (name: string) => denied.includes(name),
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.normalizeWorkspaceId.mockResolvedValue(wsId);
  mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  mocks.getPermissions.mockResolvedValue(permissions());
});

async function denied(workspace = 'ws') {
  const result = await authorizeCitationLibrary(request, auth, workspace);
  if (result.ok) throw new Error('expected a denial');
  return { status: result.response.status, body: await result.response.json() };
}

describe('citation library authorization', () => {
  it('scopes access to the verified workspace and the authenticated actor', async () => {
    const result = await authorizeCitationLibrary(request, auth, 'ws');
    expect(result).toEqual({ ok: true, scope: { wsId, actorId } });
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith(
      expect.objectContaining({ wsId, userId: actorId })
    );
  });

  it('rejects a workspace that does not normalize to a UUID before any lookup', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue('not-a-uuid');
    expect(await denied()).toEqual({
      status: 400,
      body: { error: 'INVALID_WORKSPACE' },
    });
    expect(mocks.verifyWorkspaceMembershipType).not.toHaveBeenCalled();
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('denies a non-member without reading permissions', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      ok: false,
      error: 'not_a_member',
    });
    expect(await denied()).toEqual({
      status: 403,
      body: { error: 'FORBIDDEN' },
    });
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('fails closed when membership cannot be determined', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      ok: false,
      error: 'membership_lookup_failed',
    });
    expect(await denied()).toEqual({
      status: 503,
      body: { error: 'ACCESS_UNAVAILABLE' },
    });
  });

  it('fails closed when permissions cannot be loaded', async () => {
    mocks.getPermissions.mockResolvedValue(null);
    expect(await denied()).toEqual({
      status: 503,
      body: { error: 'ACCESS_UNAVAILABLE' },
    });
  });

  it('denies a member without manage_documents', async () => {
    mocks.getPermissions.mockResolvedValue(permissions(['manage_documents']));
    expect(await denied()).toEqual({
      status: 403,
      body: { error: 'FORBIDDEN' },
    });
  });
});
