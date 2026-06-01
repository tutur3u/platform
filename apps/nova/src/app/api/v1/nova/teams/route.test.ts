import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeNovaRoleManager: vi.fn(),
  withNovaTeamCounts: vi.fn(),
}));

vi.mock('@/lib/nova-team-api-auth', () => ({
  authorizeNovaRoleManager: mocks.authorizeNovaRoleManager,
}));

vi.mock('@/lib/nova-teams', () => ({
  withNovaTeamCounts: mocks.withNovaTeamCounts,
}));

function deny(status = 403) {
  mocks.authorizeNovaRoleManager.mockResolvedValue({
    ok: false,
    response: Response.json({ error: 'Forbidden' }, { status }),
  });
}

function allow(privateDb: unknown) {
  mocks.authorizeNovaRoleManager.mockResolvedValue({
    ok: true,
    value: {
      privateDb,
      sbAdmin: { id: 'admin-client' },
      user: { id: 'manager-1' },
    },
  });
}

describe('Nova teams route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.withNovaTeamCounts.mockImplementation(async (_sbAdmin, teams) =>
      teams.map((team: Record<string, unknown>) => ({
        ...team,
        invitation_count: 0,
        member_count: 0,
      }))
    );
  });

  it('denies low-privilege users before listing teams', async () => {
    deny();
    const from = vi.fn();
    allow({ from });
    deny();

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/v1/nova/teams') as never
    );

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it('lists teams for enabled role managers', async () => {
    const order = vi.fn().mockResolvedValue({
      count: 1,
      data: [{ id: 'team-1', name: 'Team One' }],
      error: null,
    });
    const select = vi.fn(() => ({ order }));
    const privateDb = {
      from: vi.fn(() => ({ select })),
    };
    allow(privateDb);

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/v1/nova/teams') as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 1,
      data: [
        {
          id: 'team-1',
          invitation_count: 0,
          member_count: 0,
          name: 'Team One',
        },
      ],
    });
    expect(privateDb.from).toHaveBeenCalledWith('nova_teams');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('creates teams only for enabled role managers', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const single = vi.fn().mockResolvedValue({
      data: { id: 'team-1', name: 'Team One' },
      error: null,
    });
    const insertSelect = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    const privateDb = {
      from: vi.fn(() => ({ insert, select })),
    };
    allow(privateDb);

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/v1/nova/teams', {
        body: JSON.stringify({ name: ' Team One ' }),
        method: 'POST',
      }) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { id: 'team-1', name: 'Team One' },
    });
    expect(eq).toHaveBeenCalledWith('name', 'Team One');
    expect(insert).toHaveBeenCalledWith({ name: 'Team One' });
  });
});
