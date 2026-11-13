import { beforeEach, describe, expect, it, vi } from 'vitest';
const { gate } = vi.hoisted(() => ({ gate: vi.fn() }));
vi.mock('./access', () => ({
  getCmsWorkspaceAccess: gate,
  hasCmsEditPermission: (
    p: { containsPermission: (permission: string) => boolean } | null
  ) => p?.containsPermission('edit_external_projects') === true,
}));
import { getCmsExternalProjectAdminAccess } from './site-admin-access';
const mapping = {
  origin: 'https://site.example',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  canonicalProjectId: 'fictional-site',
};
const access = {
  userId: 'fixture-user',
  canAccessWorkspace: true,
  normalizedWorkspaceId: mapping.workspaceId,
  workspacePermissions: {
    membershipType: 'MEMBER',
    containsPermission: () => true,
  },
  binding: {
    enabled: true,
    workspace_id: mapping.workspaceId,
    canonical_id: mapping.canonicalProjectId,
    canonical_project: { id: mapping.canonicalProjectId, is_active: true },
  },
};
beforeEach(() => {
  vi.stubEnv('EXTERNAL_PROJECT_ADMIN_BINDINGS', JSON.stringify([mapping]));
  gate.mockReset().mockResolvedValue(access);
});
describe('CMS mapped site access adapter', () => {
  it('reuses the central gate for the mapped workspace', async () => {
    expect(await getCmsExternalProjectAdminAccess(mapping.origin)).toEqual({
      ok: true,
      access,
      mapping,
    });
    expect(gate).toHaveBeenCalledWith(mapping.workspaceId);
  });
  it('denies without a configured mapping before looking up a session', async () => {
    vi.stubEnv('EXTERNAL_PROJECT_ADMIN_BINDINGS', undefined);
    expect(await getCmsExternalProjectAdminAccess(mapping.origin)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(gate).not.toHaveBeenCalled();
  });
  it('denies absent sessions, nonmembers and root-only administrators', async () => {
    gate.mockResolvedValue({ ...access, userId: null });
    expect(await getCmsExternalProjectAdminAccess(mapping.origin)).toEqual({
      ok: false,
      reason: 'unauthorized',
    });
    for (const workspacePermissions of [
      null,
      { membershipType: 'GUEST', containsPermission: () => true },
      { membershipType: 'MEMBER', containsPermission: () => false },
    ]) {
      gate.mockResolvedValue({ ...access, workspacePermissions });
      expect(await getCmsExternalProjectAdminAccess(mapping.origin)).toEqual({
        ok: false,
        reason: 'forbidden',
      });
    }
  });
  it('denies a stale canonical binding even when the central gate allows editing', async () => {
    gate.mockResolvedValue({
      ...access,
      binding: { ...access.binding, canonical_id: 'other' },
    });
    expect(await getCmsExternalProjectAdminAccess(mapping.origin)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });
});
