import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEAM_ID = 'team-1';

const mocks = vi.hoisted(() => ({
  authorizeNovaEnabledUser: vi.fn(),
  authorizeNovaRoleManager: vi.fn(),
  authorizeNovaTeamProfileEditor: vi.fn(),
  withNovaTeamCounts: vi.fn(),
}));

vi.mock('@/lib/nova-team-api-auth', () => ({
  authorizeNovaEnabledUser: mocks.authorizeNovaEnabledUser,
  authorizeNovaRoleManager: mocks.authorizeNovaRoleManager,
  authorizeNovaTeamProfileEditor: mocks.authorizeNovaTeamProfileEditor,
}));

vi.mock('@/lib/nova-teams', () => ({
  withNovaTeamCounts: mocks.withNovaTeamCounts,
}));

function params() {
  return {
    params: Promise.resolve({ id: TEAM_ID }),
  };
}

function denyWith(mock: ReturnType<typeof vi.fn>, status = 403) {
  mock.mockResolvedValue({
    ok: false,
    response: Response.json({ error: 'Forbidden' }, { status }),
  });
}

function allowWith(mock: ReturnType<typeof vi.fn>, privateDb: unknown) {
  mock.mockResolvedValue({
    ok: true,
    value: {
      privateDb,
      sbAdmin: { id: 'admin-client' },
      user: { id: 'user-1' },
    },
  });
}

describe('Nova team detail route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.withNovaTeamCounts.mockImplementation(async (_sbAdmin, teams) =>
      teams.map((team: Record<string, unknown>) => ({
        ...team,
        invitation_count: 0,
        member_count: 1,
      }))
    );
  });

  it('returns profile-safe fields for authenticated Nova-enabled users', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        created_at: '2026-06-01T00:00:00.000Z',
        description: 'Profile',
        goals: 'Goals',
        id: TEAM_ID,
        name: 'Team One',
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const privateDb = { from: vi.fn(() => ({ select })) };
    allowWith(mocks.authorizeNovaEnabledUser, privateDb);

    const { GET } = await import('./route');
    const response = await GET(
      new Request(`http://localhost/api/v1/nova/teams/${TEAM_ID}`) as never,
      params()
    );

    expect(response.status).toBe(200);
    expect(select).toHaveBeenCalledWith(
      'id, name, description, goals, created_at'
    );
    await expect(response.json()).resolves.toMatchObject({
      data: {
        description: 'Profile',
        id: TEAM_ID,
        member_count: 1,
        name: 'Team One',
      },
    });
  });

  it('allows target team members to patch description and goals', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { description: 'Updated', goals: 'Ship', id: TEAM_ID },
      error: null,
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const privateDb = { from: vi.fn(() => ({ update })) };
    allowWith(mocks.authorizeNovaTeamProfileEditor, privateDb);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      new Request(`http://localhost/api/v1/nova/teams/${TEAM_ID}`, {
        body: JSON.stringify({ description: 'Updated', goals: 'Ship' }),
        method: 'PATCH',
      }) as never,
      params()
    );

    expect(response.status).toBe(200);
    expect(mocks.authorizeNovaTeamProfileEditor).toHaveBeenCalledWith(
      expect.any(Request),
      TEAM_ID
    );
    expect(mocks.authorizeNovaRoleManager).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      description: 'Updated',
      goals: 'Ship',
    });
  });

  it('denies non-members before patching team profile fields', async () => {
    denyWith(mocks.authorizeNovaTeamProfileEditor);
    const privateDb = { from: vi.fn() };

    const { PATCH } = await import('./route');
    const response = await PATCH(
      new Request(`http://localhost/api/v1/nova/teams/${TEAM_ID}`, {
        body: JSON.stringify({ description: 'Updated' }),
        method: 'PATCH',
      }) as never,
      params()
    );

    expect(response.status).toBe(403);
    expect(privateDb.from).not.toHaveBeenCalled();
  });

  it('requires role management for team name changes', async () => {
    denyWith(mocks.authorizeNovaRoleManager);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      new Request(`http://localhost/api/v1/nova/teams/${TEAM_ID}`, {
        body: JSON.stringify({ name: 'Renamed Team' }),
        method: 'PATCH',
      }) as never,
      params()
    );

    expect(response.status).toBe(403);
    expect(mocks.authorizeNovaRoleManager).toHaveBeenCalledWith(
      expect.any(Request)
    );
    expect(mocks.authorizeNovaTeamProfileEditor).not.toHaveBeenCalled();
  });

  it('deletes teams only after role-management authorization', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteTeam = vi.fn(() => ({ eq: deleteEq }));
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: TEAM_ID },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const privateDb = {
      from: vi.fn(() => ({
        delete: deleteTeam,
        select,
      })),
    };
    allowWith(mocks.authorizeNovaRoleManager, privateDb);

    const { DELETE } = await import('./route');
    const response = await DELETE(
      new Request(`http://localhost/api/v1/nova/teams/${TEAM_ID}`, {
        method: 'DELETE',
      }) as never,
      params()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(deleteEq).toHaveBeenCalledWith('id', TEAM_ID);
  });
});
