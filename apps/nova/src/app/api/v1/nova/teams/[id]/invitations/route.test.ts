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

describe('Nova team invitations route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('requires role-management authorization before listing invitations', async () => {
    mocks.authorizeNovaRoleManager.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        `http://localhost/api/v1/nova/teams/${TEAM_ID}/invitations`
      ) as never,
      params()
    );

    expect(response.status).toBe(403);
  });

  it('creates invitations only after role-management authorization', async () => {
    const teamSingle = vi.fn().mockResolvedValue({
      data: { id: TEAM_ID },
      error: null,
    });
    const teamEq = vi.fn(() => ({ single: teamSingle }));
    const teamSelect = vi.fn(() => ({ eq: teamEq }));
    const invitationMaybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const invitationEqEmail = vi.fn(() => ({
      maybeSingle: invitationMaybeSingle,
    }));
    const invitationEqTeam = vi.fn(() => ({ eq: invitationEqEmail }));
    const invitationSelect = vi.fn(() => ({ eq: invitationEqTeam }));
    const insertSingle = vi.fn().mockResolvedValue({
      data: { email: 'member@example.com', team_id: TEAM_ID },
      error: null,
    });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    const privateDb = {
      from: vi.fn((table: string) => {
        if (table === 'nova_teams') return { select: teamSelect };
        if (table === 'nova_team_emails') {
          return { insert, select: invitationSelect };
        }
        if (table === 'nova_team_members') return { insert: vi.fn() };
        return {};
      }),
    };
    const userSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const userEq = vi.fn(() => ({ single: userSingle }));
    const userSelect = vi.fn(() => ({ eq: userEq }));
    const sbAdmin = {
      from: vi.fn(() => ({ select: userSelect })),
    };
    mocks.authorizeNovaRoleManager.mockResolvedValue({
      ok: true,
      value: { privateDb, sbAdmin, user: { id: 'manager-1' } },
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request(`http://localhost/api/v1/nova/teams/${TEAM_ID}/invitations`, {
        body: JSON.stringify({ email: 'member@example.com' }),
        method: 'POST',
      }) as never,
      params()
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith([
      { email: 'member@example.com', team_id: TEAM_ID },
    ]);
  });
});
