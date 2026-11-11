import { beforeEach, describe, expect, it, vi } from 'vitest';
const { gate } = vi.hoisted(() => ({ gate: vi.fn() }));
vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: gate,
}));
import { POST } from './route';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const origin = 'https://site.example';
const mapping = { origin, workspaceId, canonicalProjectId: 'fictional-site' };
const permissions = {
  membershipType: 'MEMBER',
  containsPermission: (p: string) => p === 'edit_external_projects',
};
const allowed = () => ({
  ok: true,
  normalizedWorkspaceId: workspaceId,
  user: { id: 'fixture-user', email: 'own@example.test' },
  workspacePermissions: permissions,
  binding: {
    enabled: true,
    workspace_id: workspaceId,
    canonical_id: 'fictional-site',
    canonical_project: { id: 'fictional-site', is_active: true },
  },
});
function post(siteOrigin = origin) {
  return POST(
    new Request('https://web.example/api', {
      method: 'POST',
      body: JSON.stringify({ origin: siteOrigin }),
    }),
    { params: Promise.resolve({ wsId: workspaceId }) }
  );
}
beforeEach(() => {
  vi.stubEnv('EXTERNAL_PROJECT_ADMIN_BINDINGS', JSON.stringify([mapping]));
  gate.mockReset().mockResolvedValue(allowed());
});
describe('shared external project admin gate', () => {
  it('calls the existing edit gate and supplies the same admin and analytics paths', async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(gate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'edit', wsId: workspaceId })
    );
    expect(await response.json()).toEqual({
      paths: { admin: '/admin', analytics: '/admin/analytics' },
      user: { email: 'own@example.test' },
    });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('preserves central denial', async () => {
    gate.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    expect((await post()).status).toBe(401);
  });
  it('rejects absent or wrong site/workspace/canonical mapping', async () => {
    vi.stubEnv('EXTERNAL_PROJECT_ADMIN_BINDINGS', '[]');
    expect((await post()).status).toBe(404);
    expect(gate).not.toHaveBeenCalled();
    vi.stubEnv('EXTERNAL_PROJECT_ADMIN_BINDINGS', JSON.stringify([mapping]));
    expect((await post('https://other.example')).status).toBe(404);
    gate.mockResolvedValue({
      ...allowed(),
      binding: { ...allowed().binding, canonical_id: 'other' },
    });
    expect((await post()).status).toBe(403);
  });
  it.each([
    null,
    { ...permissions, membershipType: 'GUEST' },
    { ...permissions, containsPermission: () => false },
  ])(
    'rejects nonstaff even if root gate allowed access',
    async (workspacePermissions) => {
      gate.mockResolvedValue({ ...allowed(), workspacePermissions });
      const response = await post();
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: 'Forbidden',
        user: { email: 'own@example.test' },
      });
    }
  );
  it('rejects malformed and oversized bodies without invoking the gate', async () => {
    for (const body of [
      '{',
      JSON.stringify({ origin: 'x'.repeat(513) }),
      'null',
    ]) {
      const response = await POST(
        new Request('https://web.example/api', { method: 'POST', body }),
        { params: Promise.resolve({ wsId: workspaceId }) }
      );
      expect([400, 404]).toContain(response.status);
      expect(response.headers.get('cache-control')).toContain('no-store');
    }
    expect(gate).not.toHaveBeenCalled();
  });
  it('rejects another workspace and a disabled binding', async () => {
    const response = await POST(
      new Request('https://web.example/api', {
        method: 'POST',
        body: JSON.stringify({ origin }),
      }),
      {
        params: Promise.resolve({
          wsId: '33333333-3333-4333-8333-333333333333',
        }),
      }
    );
    expect(response.status).toBe(404);
    expect(gate).not.toHaveBeenCalled();
    gate.mockResolvedValue({
      ...allowed(),
      binding: { ...allowed().binding, enabled: false },
    });
    expect((await post()).status).toBe(403);
  });
  it.each([
    'edit_external_projects',
    'publish_external_projects',
    'manage_external_projects',
  ])('preserves the central %s permission', async (grant) => {
    gate.mockResolvedValue({
      ...allowed(),
      workspacePermissions: {
        membershipType: 'MEMBER',
        containsPermission: (permission: string) => permission === grant,
      },
    });
    expect((await post()).status).toBe(200);
  });
});
