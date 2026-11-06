import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = { data: unknown; error: { code: string } | null };

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentUser: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/user-helper', () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

import {
  DELETE,
  POST,
} from '@/legacy-api-routes/v1/integrations/discord/members/route';

const WS_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_ID = '44444444-4444-4444-8444-444444444444';

// Each from(table) call consumes the next queued result for that table; the
// chain resolves it from single/maybeSingle, or from the awaited delete chain.
function mockSupabase(
  results: Record<string, QueryResult[]>,
  permission: QueryResult
) {
  const from = vi.fn((table: string) => {
    const result = results[table]?.shift();
    if (!result) throw new Error(`Unexpected query on ${table}`);

    const deleteChain = (): Promise<QueryResult> & { eq: () => unknown } =>
      Object.assign(Promise.resolve(result), { eq: deleteChain });
    const query: Record<string, unknown> = {};
    query.eq = vi.fn(() => query);
    query.insert = vi.fn(() => query);
    query.delete = vi.fn(deleteChain);
    query.select = vi.fn(() => query);
    query.single = vi.fn(async () => result);
    query.maybeSingle = vi.fn(async () => result);
    return query;
  });
  const rpc = vi.fn(async () => permission);

  mocks.createClient.mockResolvedValue({ from, rpc });
  return { from, rpc };
}

function request(method: 'DELETE' | 'POST', body: unknown) {
  return new NextRequest(
    'http://localhost/api/v1/integrations/discord/members',
    { body: JSON.stringify(body), method }
  );
}

const allowed = { data: { allow_discord_integrations: true }, error: null };
const empty = { data: null, error: null };
const integration = { data: { id: 'integration-1' }, error: null };
const addBody = {
  discordGuildId: 'guild-1',
  discordUserId: '123456789012345678',
  platformUserId: TARGET_ID,
  wsId: WS_ID,
};
const removeBody = {
  discordGuildId: 'guild-1',
  memberId: MEMBER_ID,
  wsId: WS_ID,
};

describe('Discord members route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: 'user-1' });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('rejects mapping a coworker without manage_workspace_integrations', async () => {
    const { from, rpc } = mockSupabase(
      { platform_user_roles: [allowed] },
      { data: false, error: null }
    );

    const response = await POST(request('POST', addBody));

    expect(response.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith('has_workspace_permission', {
      p_permission: 'manage_workspace_integrations',
      p_user_id: 'user-1',
      p_ws_id: WS_ID,
    });
    expect(from).not.toHaveBeenCalledWith('discord_guild_members');
  });

  it('fails closed when the permission check errors', async () => {
    mockSupabase(
      { platform_user_roles: [allowed] },
      { data: null, error: { code: 'XX000' } }
    );

    const response = await POST(request('POST', addBody));

    expect(response.status).toBe(500);
  });

  it('maps a workspace member for an integration manager', async () => {
    mockSupabase(
      {
        discord_guild_members: [
          empty,
          empty,
          { data: { id: MEMBER_ID }, error: null },
        ],
        discord_integrations: [integration],
        platform_user_roles: [allowed],
      },
      { data: true, error: null }
    );

    const response = await POST(request('POST', addBody));

    expect(response.status).toBe(200);
  });

  it('reports a duplicate Discord identity as a conflict', async () => {
    mockSupabase(
      {
        discord_guild_members: [
          empty,
          empty,
          { data: null, error: { code: '23505' } },
        ],
        discord_integrations: [integration],
        platform_user_roles: [allowed],
      },
      { data: true, error: null }
    );

    const response = await POST(request('POST', addBody));

    expect(response.status).toBe(409);
  });

  it('rejects removing a mapping without manage_workspace_integrations', async () => {
    const { from } = mockSupabase(
      { platform_user_roles: [allowed] },
      { data: false, error: null }
    );

    const response = await DELETE(request('DELETE', removeBody));

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalledWith('discord_guild_members');
  });

  it('removes a mapping for an integration manager', async () => {
    mockSupabase(
      {
        discord_guild_members: [empty],
        discord_integrations: [integration],
        platform_user_roles: [allowed],
      },
      { data: true, error: null }
    );

    const response = await DELETE(request('DELETE', removeBody));

    expect(response.status).toBe(200);
  });
});
