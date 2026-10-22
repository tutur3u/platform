// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUT as activate } from './clients/[clientId]/activation/route';
import { PUT as assign } from './clients/[clientId]/assignments/route';
import { GET as detail, PATCH as update } from './clients/[clientId]/route';
import { POST as create, GET as list } from './clients/route';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  member: vi.fn(),
  permission: vi.fn(),
  rpc: vi.fn(),
  principal: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('@/lib/sso/identity', () => ({ managementPrincipal: mocks.principal }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.permission,
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: mocks.member }) }),
      }),
    }),
  }),
  createAdminClient: async () => ({ rpc: mocks.rpc }),
}));
const wsId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000004';
const clientId = '00000000-0000-4000-8000-000000000001';
const context = { params: Promise.resolve({ wsId, clientId }) };
const input = {
  displayName: 'Claude',
  entityId: 'urn:workos:test',
  acsUrl: 'https://sp.example.test/acs',
  domains: ['example.test'],
  nameIdFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  requestSigning: { mode: 'unsigned' },
};
const client = {
  ...input,
  id: clientId,
  enabled: false,
  revision: 1,
  requestSigningMode: 'unsigned',
  spCertificate: null,
};
const request = (
  body?: unknown,
  method = 'POST',
  headers: Record<string, string> = {}
) =>
  new Request(
    `https://idp.example.test/api/v1/workspaces/${wsId}/sso/clients`,
    {
      method: body === undefined ? 'GET' : method,
      headers: {
        origin: 'https://idp.example.test',
        'content-type': 'application/json',
        ...headers,
      },
      ...(body === undefined
        ? {}
        : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }
  );
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('SSO_SAML_ENABLED', 'false');
  vi.stubEnv('SSO_SAML_ORIGIN', 'https://idp.example.test/');
  vi.stubEnv('SSO_SAML_CLIENT_ID', clientId);
  mocks.getUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
  mocks.member.mockResolvedValue({ data: { type: 'MEMBER' }, error: null });
  mocks.permission.mockResolvedValue({ data: true, error: null });
  mocks.principal.mockResolvedValue({
    userId,
    mfaAt: Math.floor(Date.now() / 1000),
  });
  mocks.rpc.mockImplementation(async (name) => ({
    error: null,
    data:
      name === 'sso_management_overview'
        ? { clients: [client] }
        : name === 'sso_management_detail'
          ? { members: [], keys: [], audit: [] }
          : { id: clientId, revision: 2 },
  }));
});

describe('SSO management authorization', () => {
  it.each([list, detail])('requires authenticated reads', async (handler) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await handler(request(), context)).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([list, detail, create, update, assign, activate])(
    'denies non-admin member without management permission',
    async (handler) => {
      mocks.permission.mockResolvedValue({ data: false, error: null });
      expect((await handler(request(input), context)).status).toBe(403);
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );
  it('denies guests even with broad permissions', async () => {
    mocks.member.mockResolvedValue({ data: { type: 'GUEST' }, error: null });
    expect((await list(request(), context)).status).toBe(403);
    expect(mocks.permission).not.toHaveBeenCalled();
  });
  it('denies other-workspace access before admin reads', async () => {
    mocks.member.mockResolvedValue({ data: null, error: null });
    expect((await detail(request(), context)).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not turn membership lookup faults into authorization denials', async () => {
    mocks.member.mockResolvedValue({
      data: null,
      error: { message: 'sensitive' },
    });
    const result = await list(request(), context);
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('sensitive');
  });
  it('binds child reads to canonical workspace and actor', async () => {
    await detail(request(), context);
    expect(mocks.rpc).toHaveBeenCalledWith('sso_management_detail', {
      p_ws_id: wsId,
      p_actor_id: userId,
      p_client_id: clientId,
    });
  });
  it('denies foreign client with sanitized RPC error', async () => {
    mocks.rpc.mockResolvedValue({
      error: { code: '42501', message: 'secret details' },
    });
    const result = await detail(request(), context);
    expect(result.status).toBe(403);
    expect(await result.json()).toEqual({ error: 'sso_forbidden' });
  });
  it.each([create, update, assign, activate])(
    'requires fresh MFA for mutations',
    async (handler) => {
      mocks.principal.mockResolvedValue({
        userId,
        mfaAt: Math.floor(Date.now() / 1000) - 601,
      });
      const result = await handler(request(input), context);
      expect(result.status).toBe(403);
      expect(await result.json()).toEqual({ error: 'sso_mfa_required' });
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );
});

describe('SSO management contracts', () => {
  it('shows the live global flag without changing it', async () => {
    expect(await (await list(request(), context)).json()).toMatchObject({
      globalEnabled: false,
    });
    vi.stubEnv('SSO_SAML_ENABLED', 'true');
    expect(await (await list(request(), context)).json()).toMatchObject({
      globalEnabled: true,
    });
  });
  it('always creates disabled and stamps actor server-side', async () => {
    expect((await create(request(input), context)).status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'sso_save_saml_client',
      expect.objectContaining({
        p_enabled: false,
        p_expected_revision: 0,
        p_actor_id: userId,
        p_ws_id: wsId,
        p_acs_url: input.acsUrl,
      })
    );
  });
  it.each([
    { ...input, enabled: true },
    { ...input, actorId: userId },
    { ...input, acsUrl: 'https://sp.example.test/acs#fragment' },
    { ...input, nameIdFormat: 'email' },
    {
      ...input,
      requestSigning: { mode: 'required', certificate: 'not a certificate' },
    },
  ])('rejects untrusted create input', async (body) => {
    expect((await create(request(body), context)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON', async () => {
    expect((await create(request('{'), context)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects cross-origin writes', async () => {
    expect(
      (
        await create(
          request(input, 'POST', { origin: 'https://evil.test' }),
          context
        )
      ).status
    ).toBe(403);
    expect(mocks.principal).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation before enabling', async () => {
    expect(
      (await activate(request({ expectedRevision: 1, enabled: true }), context))
        .status
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('allows confirmed client enable while global flag stays off', async () => {
    expect(
      (
        await activate(
          request({ expectedRevision: 1, enabled: true, confirmEnable: true }),
          context
        )
      ).status
    ).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'sso_set_client_enabled',
      expect.objectContaining({ p_enabled: true, p_expected_revision: 1 })
    );
    expect(process.env.SSO_SAML_ENABLED).toBe('false');
  });
  it('disables without resubmitting or replacing trust configuration', async () => {
    expect(
      (
        await activate(
          request({ expectedRevision: 1, enabled: false }),
          context
        )
      ).status
    ).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('sso_set_client_enabled', {
      p_ws_id: wsId,
      p_actor_id: userId,
      p_client_id: clientId,
      p_expected_revision: 1,
      p_enabled: false,
    });
  });
  it('keeps stale revision conflicts explicit', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: '40001' } });
    expect(
      (
        await update(
          request({ ...input, expectedRevision: 1, enabled: false }),
          context
        )
      ).status
    ).toBe(409);
  });
  it('rejects guest assignment through the atomic membership RPC', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: '42501' } });
    const result = await assign(
      request({ userId, expectedRevision: 0, active: true }),
      context
    );
    expect(result.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledWith('sso_set_assignment', {
      p_ws_id: wsId,
      p_actor_id: userId,
      p_client_id: clientId,
      p_user_id: userId,
      p_expected_revision: 0,
      p_active: true,
    });
  });
  it('strips unexpected audit and roster data from RPC projection', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        members: [],
        keys: [],
        audit: [
          {
            id: clientId,
            eventType: 'client.created',
            revision: 1,
            createdAt: '2026-10-22T00:00:00Z',
            email: 'private@example.test',
            transaction_id: 'secret',
          },
        ],
        private_key: 'sensitive',
      },
      error: null,
    });
    const body = await (await detail(request(), context)).json();
    expect(JSON.stringify(body)).not.toMatch(/private|secret|email/);
    expect(body.setup).toEqual({
      metadataUrl: `https://idp.example.test/api/v1/sso/saml/${clientId}/metadata`,
      entityId: `https://idp.example.test/api/v1/sso/saml/${clientId}/metadata`,
      ssoUrl: `https://idp.example.test/api/v1/sso/saml/${clientId}/sso`,
    });
  });
  it('never builds setup URLs from request Host', async () => {
    vi.stubEnv('SSO_SAML_ORIGIN', '');
    const body = await (await detail(request(), context)).json();
    expect(body.setup).toBeNull();
  });
});
