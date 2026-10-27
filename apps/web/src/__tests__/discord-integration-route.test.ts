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
} from '@/legacy-api-routes/v1/integrations/discord/route';

const WS_ID = '11111111-1111-4111-8111-111111111111';
const INTEGRATION_ID = '22222222-2222-4222-8222-222222222222';

// Each from(table) call consumes the next queued result for that table; the
// chain resolves it from single/maybeSingle, or from select after delete.
function mockSupabase(results: Record<string, QueryResult[]>) {
  const from = vi.fn((table: string) => {
    const result = results[table]?.shift();
    if (!result) throw new Error(`Unexpected query on ${table}`);

    let deleting = false;
    const query: Record<string, unknown> = {};
    query.eq = vi.fn(() => query);
    query.insert = vi.fn(() => query);
    query.delete = vi.fn(() => {
      deleting = true;
      return query;
    });
    query.select = vi.fn(() => (deleting ? Promise.resolve(result) : query));
    query.single = vi.fn(async () => result);
    query.maybeSingle = vi.fn(async () => result);
    return query;
  });

  mocks.createClient.mockResolvedValue({ from });
  return from;
}

function request(method: 'DELETE' | 'POST', body: unknown) {
  return new NextRequest('http://localhost/api/v1/integrations/discord', {
    body: JSON.stringify(body),
    method,
  });
}

const allowed = { data: { allow_discord_integrations: true }, error: null };
const empty = { data: null, error: null };

describe('Discord integration route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: 'user-1' });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('reports a guild bound to a hidden workspace as a conflict', async () => {
    mockSupabase({
      discord_integrations: [
        empty,
        empty,
        { data: null, error: { code: '23505' } },
      ],
      platform_user_roles: [allowed],
    });

    const response = await POST(
      request('POST', { discordGuildId: 'guild-1', wsId: WS_ID })
    );

    expect(response.status).toBe(409);
  });

  it('reports an RLS-rejected connect as forbidden', async () => {
    mockSupabase({
      discord_integrations: [
        empty,
        empty,
        { data: null, error: { code: '42501' } },
      ],
      platform_user_roles: [allowed],
    });

    const response = await POST(
      request('POST', { discordGuildId: 'guild-1', wsId: WS_ID })
    );

    expect(response.status).toBe(403);
  });

  it('connects a guild for the workspace', async () => {
    mockSupabase({
      discord_integrations: [
        empty,
        empty,
        { data: { id: INTEGRATION_ID }, error: null },
      ],
      platform_user_roles: [allowed],
    });

    const response = await POST(
      request('POST', { discordGuildId: 'guild-1', wsId: WS_ID })
    );

    expect(response.status).toBe(200);
  });

  it('reports a delete filtered by RLS as forbidden', async () => {
    mockSupabase({
      discord_integrations: [
        { data: { ws_id: WS_ID }, error: null },
        { data: [], error: null },
      ],
      platform_user_roles: [allowed],
    });

    const response = await DELETE(
      request('DELETE', { integrationId: INTEGRATION_ID, wsId: WS_ID })
    );

    expect(response.status).toBe(403);
  });

  it('disconnects the integration when a row is deleted', async () => {
    mockSupabase({
      discord_integrations: [
        { data: { ws_id: WS_ID }, error: null },
        { data: [{ id: INTEGRATION_ID }], error: null },
      ],
      platform_user_roles: [allowed],
    });

    const response = await DELETE(
      request('DELETE', { integrationId: INTEGRATION_ID, wsId: WS_ID })
    );

    expect(response.status).toBe(200);
  });
});
