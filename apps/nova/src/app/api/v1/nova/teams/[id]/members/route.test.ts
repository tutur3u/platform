import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEAM_ID = 'team-1';

const mocks = vi.hoisted(() => ({
  authorizeNovaRoleManager: vi.fn(),
}));

vi.mock('@/lib/nova-team-api-auth', () => ({
  authorizeNovaRoleManager: mocks.authorizeNovaRoleManager,
}));

function params() {
  return {
    params: Promise.resolve({ id: TEAM_ID }),
  };
}

describe('Nova team members route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('requires role-management authorization before listing members', async () => {
    const privateDb = { from: vi.fn() };
    mocks.authorizeNovaRoleManager.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        `http://localhost/api/v1/nova/teams/${TEAM_ID}/members`
      ) as never,
      params()
    );

    expect(response.status).toBe(403);
    expect(privateDb.from).not.toHaveBeenCalled();
  });

  it('adds members only after role-management authorization', async () => {
    const teamSingle = vi.fn().mockResolvedValue({
      data: { id: TEAM_ID },
      error: null,
    });
    const teamEq = vi.fn(() => ({ single: teamSingle }));
    const teamSelect = vi.fn(() => ({ eq: teamEq }));
    const memberMaybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const memberEqUser = vi.fn(() => ({ maybeSingle: memberMaybeSingle }));
    const memberEqTeam = vi.fn(() => ({ eq: memberEqUser }));
    const memberSelect = vi.fn(() => ({ eq: memberEqTeam }));
    const insertSingle = vi.fn().mockResolvedValue({
      data: { team_id: TEAM_ID, user_id: 'member-1' },
      error: null,
    });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    const privateDb = {
      from: vi.fn((table: string) => {
        if (table === 'nova_teams') return { select: teamSelect };
        if (table === 'nova_team_members')
          return { insert, select: memberSelect };
        return {};
      }),
    };
    mocks.authorizeNovaRoleManager.mockResolvedValue({
      ok: true,
      value: { privateDb, sbAdmin: {}, user: { id: 'manager-1' } },
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request(`http://localhost/api/v1/nova/teams/${TEAM_ID}/members`, {
        body: JSON.stringify({ user_id: 'member-1' }),
        method: 'POST',
      }) as never,
      params()
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      team_id: TEAM_ID,
      user_id: 'member-1',
    });
  });
});
