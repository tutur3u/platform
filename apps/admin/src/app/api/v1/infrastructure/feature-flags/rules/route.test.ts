// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: mocks.authorize,
}));

import { GET, POST } from './route';
import { GET as GET_AUDIT } from './audit/route';

const actor = '44444444-4444-4444-8444-444444444444';
const operationId = '55555555-5555-4555-8555-555555555555';
const workspaceId = '66666666-6666-4666-8666-666666666666';
const bearer = { Authorization: 'Bearer fixture-admin-token' };

const write = {
  environment: 'production',
  expectedRevision: 0,
  flagKey: 'MEET_UX_V2',
  mode: 'staff',
  operationId,
  reason: 'Staff first',
  scope: 'platform',
  subjectId: null,
};

function post(body: unknown, headers: Record<string, string> = bearer) {
  return POST(
    new Request('https://infra.tuturuuu.com/rules', {
      body: JSON.stringify(body),
      headers,
      method: 'POST',
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({
    ok: true,
    sbAdmin: { schema: () => ({ rpc: mocks.rpc }) },
    user: { id: actor },
  });
  mocks.rpc.mockResolvedValue({
    data: { flagKey: 'MEET_UX_V2', revision: 1, status: 'applied' },
    error: null,
  });
});

describe('infrastructure feature flag rule routes', () => {
  it('returns the admin denial before touching the store', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: new Response('{}', { status: 403 }),
    });
    expect((await GET(new Request('http://localhost/rules'))).status).toBe(403);
    expect((await post(write)).status).toBe(403);
    expect(
      (await GET_AUDIT(new Request('http://localhost/audit'))).status
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires manage_feature_flags to write and either permission to read', async () => {
    await post(write);
    expect(mocks.authorize).toHaveBeenLastCalledWith(
      'manage_feature_flags',
      true,
      expect.any(Request)
    );
    await GET(new Request('http://localhost/rules'));
    expect(mocks.authorize).toHaveBeenLastCalledWith(
      ['view_infrastructure', 'manage_feature_flags'],
      true,
      expect.any(Request)
    );
  });

  it('lists rules with a bounded, validated query', async () => {
    mocks.rpc.mockResolvedValue({
      data: { nextCursor: null, rules: [{ flagKey: 'MEET_UX_V2' }] },
      error: null,
    });
    const response = await GET(
      new Request('http://localhost/rules?flagKey=MEET_UX_V2&limit=10')
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      nextCursor: null,
      rules: [{ flagKey: 'MEET_UX_V2' }],
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'feature_flag_read_rules',
      expect.objectContaining({
        p_actor: actor,
        p_environment: 'production',
        p_flag_key: 'MEET_UX_V2',
        p_limit: 10,
      })
    );
    expect(
      (await GET(new Request('http://localhost/rules?limit=5000'))).status
    ).toBe(400);
  });

  it('maps read failures without leaking database detail', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'feature_flag_denied' },
    });
    const denied = await GET(new Request('http://localhost/rules'));
    expect(denied.status).toBe(403);
    mocks.rpc.mockRejectedValue(new Error('secret connection string'));
    const down = await GET(new Request('http://localhost/rules'));
    expect(down.status).toBe(503);
    expect(JSON.stringify(await down.json())).not.toContain('secret');
  });

  it('writes with the session actor and the ttr client for a bearer token', async () => {
    const response = await post(write);
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'feature_flag_mutate_rule',
      expect.objectContaining({
        p_actor: actor,
        p_client: 'ttr',
        p_flag_key: 'MEET_UX_V2',
        p_mode: 'staff',
        p_operation_id: operationId,
      })
    );
    expect(JSON.stringify(await response.json())).not.toContain(actor);
  });

  it('records the admin screen as the client for a cookie session', async () => {
    const origin = 'https://infra.tuturuuu.com';
    await post(write, {
      origin,
      'x-tuturuuu-feature-flag-action': '1',
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'feature_flag_mutate_rule',
      expect.objectContaining({ p_client: 'admin-ui' })
    );
  });

  it('refuses a cookie write without same-origin intent', async () => {
    expect((await post(write, {})).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses forged fields and invalid rules before the store', async () => {
    expect((await post({ ...write, actorId: actor })).status).toBe(400);
    expect((await post({ ...write, client: 'migration' })).status).toBe(400);
    expect((await post({ ...write, flagKey: 'NOT_A_FLAG' })).status).toBe(404);
    expect(
      (await post({ ...write, mode: 'rollout', percentage: 200 })).status
    ).toBe(422);
    expect(
      (
        await post({
          ...write,
          scope: 'workspace',
          subjectId: workspaceId,
          mode: 'on',
        })
      ).status
    ).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const bad = await POST(
      new Request('http://localhost/rules', {
        body: '{nope',
        headers: bearer,
        method: 'POST',
      })
    );
    expect(bad.status).toBe(400);
  });

  it('maps a revision conflict and a database denial', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { revision: 4, status: 'conflict' },
      error: null,
    });
    const conflict = await post(write);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: 'conflict', revision: 4 });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'feature_flag_denied' },
    });
    expect((await post(write)).status).toBe(403);
  });

  it('pages the audit with a validated cursor', async () => {
    mocks.rpc.mockResolvedValue({ data: { rows: [] }, error: null });
    const response = await GET_AUDIT(
      new Request(
        `http://localhost/audit?limit=20&before=2026-11-25T00:00:00Z&beforeId=${operationId}`
      )
    );
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'feature_flag_read_audit',
      expect.objectContaining({ p_limit: 20, p_before_id: operationId })
    );
    for (const query of [
      'limit=101',
      'before=nope',
      `beforeId=${operationId}`,
    ]) {
      expect(
        (await GET_AUDIT(new Request(`http://localhost/audit?${query}`))).status
      ).toBe(400);
    }
  });
});
