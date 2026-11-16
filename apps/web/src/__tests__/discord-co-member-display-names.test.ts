import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  resolveCoMemberNames: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();

  return {
    ...actual,
    connection: () => mocks.connection(),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/utils/co-member-names', () => ({
  resolveCoMemberNames: mocks.resolveCoMemberNames,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

import { GET as getAvailableMembers } from '@/legacy-api-routes/v1/integrations/discord/available-members/route';
import { withCoMemberDisplayNames } from '@/lib/discord/co-member-display-names';

const WS_ID = '11111111-1111-4111-8111-111111111111';
const VIEWER_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN = { name: 'admin-client' };

function namelessRow() {
  return {
    user_id: TARGET_ID,
    users: {
      avatar_url: null,
      display_name: null,
      handle: 'nameless',
      id: TARGET_ID,
    },
  };
}

describe('withCoMemberDisplayNames', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue(ADMIN);
  });

  it('names a nameless co-member by email for a member viewer', async () => {
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([[TARGET_ID, 'nameless@example.com']])
    );

    const [row] = await withCoMemberDisplayNames({
      rows: [namelessRow()],
      viewerUserId: VIEWER_ID,
      wsId: WS_ID,
    });

    expect(row?.users?.display_name).toBe('nameless@example.com');
    expect(row?.users).not.toHaveProperty('email');
    expect(mocks.resolveCoMemberNames).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: ADMIN,
        viewerUserId: VIEWER_ID,
        wsId: WS_ID,
      })
    );
  });

  it('keeps no email when the helper falls back to the handle (HIDE_MEMBER_EMAIL or non-member viewer)', async () => {
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([[TARGET_ID, 'nameless']])
    );

    const [row] = await withCoMemberDisplayNames({
      rows: [namelessRow()],
      viewerUserId: VIEWER_ID,
      wsId: WS_ID,
    });

    expect(row?.users?.display_name).toBeNull();
    expect(JSON.stringify(row)).not.toContain('@example.com');
  });

  it('skips the lookup when every user already has a display name', async () => {
    const rows = [
      { users: { display_name: 'Named', handle: 'named', id: TARGET_ID } },
    ];

    const result = await withCoMemberDisplayNames({
      rows,
      viewerUserId: VIEWER_ID,
      wsId: WS_ID,
    });

    expect(result).toBe(rows);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.resolveCoMemberNames).not.toHaveBeenCalled();
  });
});

describe('Discord available-members route names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue(ADMIN);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: VIEWER_ID },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  function mockSupabase(members: unknown[]) {
    const results: Record<string, unknown> = {
      discord_guild_members: { data: [], error: null },
      discord_integrations: { data: { id: 'integration-1' }, error: null },
      platform_user_roles: {
        data: { allow_discord_integrations: true },
        error: null,
      },
      workspace_members: { data: members, error: null },
    };
    const from = vi.fn((table: string) => {
      const result = results[table];
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order', 'limit', 'not', 'or']) {
        query[method] = vi.fn(() => query);
      }
      query.single = vi.fn(async () => result);
      query.then = (resolve: (value: unknown) => unknown) => resolve(result);
      return query;
    });
    mocks.createClient.mockResolvedValue({ from });
  }

  function request() {
    const params = new URLSearchParams({
      discordGuildId: 'guild-1',
      wsId: WS_ID,
    });
    return new NextRequest(
      `http://localhost/api/v1/integrations/discord/available-members?${params}`
    );
  }

  it('returns the co-member email only as the display name', async () => {
    mockSupabase([namelessRow()]);
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([[TARGET_ID, 'nameless@example.com']])
    );

    const response = await getAvailableMembers(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0].users.display_name).toBe('nameless@example.com');
    expect(body.data[0].users).not.toHaveProperty('email');
    expect(mocks.resolveCoMemberNames).toHaveBeenCalledWith(
      expect.objectContaining({ viewerUserId: VIEWER_ID, wsId: WS_ID })
    );
  });

  it('returns no email when the helper withholds it', async () => {
    mockSupabase([namelessRow()]);
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([[TARGET_ID, 'nameless']])
    );

    const response = await getAvailableMembers(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0].users.display_name).toBeNull();
    expect(JSON.stringify(body)).not.toContain('@example.com');
  });
});
