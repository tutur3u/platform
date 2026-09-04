import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  invite: vi.fn(),
  requireAccess: vi.fn(),
  updateRoles: vi.fn(),
};

vi.mock('@/lib/external-projects/team-access', () => ({
  inviteExternalProjectTeamMembers: (...args: unknown[]) =>
    mocks.invite(...args),
  requireExternalProjectTeamAccess: (...args: unknown[]) =>
    mocks.requireAccess(...args),
  updateExternalProjectTeamInvitationRoles: (...args: unknown[]) =>
    mocks.updateRoles(...args),
}));

const access = { normalizedWorkspaceId: 'workspace-1', ok: true };

describe('external-project invitation access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccess.mockResolvedValue(access);
    mocks.invite.mockResolvedValue(Response.json({ message: 'invited' }));
    mocks.updateRoles.mockResolvedValue(Response.json({ message: 'updated' }));
  });

  it('invites members through the scoped team-access contract', async () => {
    const { POST } = await import('./route');
    const request = new Request('http://localhost/invite', {
      body: JSON.stringify({ emails: ['editor@example.com'] }),
      method: 'POST',
    });
    const response = await POST(request, {
      params: Promise.resolve({ wsId: 'requested-workspace' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireAccess).toHaveBeenCalledWith({
      capability: 'manage-members',
      request,
      wsId: 'requested-workspace',
    });
    expect(mocks.invite).toHaveBeenCalledWith({ access, request });
  });

  it('updates access levels on an outstanding invitation', async () => {
    const { PATCH } = await import('./route');
    const request = new Request('http://localhost/invite', {
      body: JSON.stringify({
        email: 'editor@example.com',
        roleIds: ['8f98318a-a101-4729-9e2a-b59f28b9c302'],
      }),
      method: 'PATCH',
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ wsId: 'requested-workspace' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.updateRoles).toHaveBeenCalledWith({ access, request });
  });

  it('does not reach invitation mutations when access is denied', async () => {
    mocks.requireAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/invite', { method: 'POST' }),
      { params: Promise.resolve({ wsId: 'requested-workspace' }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.invite).not.toHaveBeenCalled();
  });
});
