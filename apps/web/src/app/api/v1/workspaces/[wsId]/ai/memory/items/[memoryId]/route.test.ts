import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  edit: vi.fn(),
  client: vi.fn(),
  member: vi.fn(),
  rpc: vi.fn(),
  normalize: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('@tuturuuu/ai/memory', () => ({
  AI_MEMORY_PRODUCTS: ['mira', 'memories'],
  resolveAiMemoryScope: (scope: unknown) => scope,
  readAiMemoryForEdit: mocks.read,
  editAiMemory: mocks.edit,
  forgetAiMemory: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.client,
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async (client: { user: unknown }) => ({
    user: client.user,
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
  verifyWorkspaceMembershipType: mocks.member,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import * as route from './route';

const params = {
  params: Promise.resolve({ wsId: 'personal', memoryId: 'synthetic-memory' }),
};
const revision = `v1:${'a'.repeat(32)}`;
const memory = {
  id: 'synthetic-memory',
  content: 'Synthetic preference',
  revision,
  metadata: { privateProvenance: 'must not return' },
  customId: 'private-source',
  status: 'done',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ schema: () => ({ rpc: mocks.rpc }) });
  mocks.client.mockImplementation(async (request: Request) => ({
    user:
      request.headers.get('authorization') === 'Bearer synthetic-valid' ||
      request.headers.get('cookie') === 'session=synthetic-valid'
        ? { id: 'synthetic-actor' }
        : null,
  }));
  mocks.normalize.mockResolvedValue('resolved-workspace');
  mocks.member.mockResolvedValue({ ok: true });
  mocks.read.mockResolvedValue({ ok: true, memory });
  mocks.edit.mockResolvedValue({
    ok: true,
    memory: { ...memory, revision: `v1:${'b'.repeat(32)}` },
  });
  mocks.rpc.mockResolvedValue({ data: 'synthetic-audit', error: null });
});
function request(
  method = 'GET',
  body?: unknown,
  auth = 'Bearer synthetic-valid'
) {
  return new NextRequest('https://example.test/api?product=mira', {
    method,
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function call(method: 'GET' | 'PATCH', req: NextRequest) {
  const handler = (
    route as unknown as Record<
      string,
      (req: NextRequest, context: typeof params) => Promise<Response>
    >
  )[method];
  expect(handler, `${method} memory item handler exists`).toBeTypeOf(
    'function'
  );
  return handler!(req, params);
}
it('reads a scoped edit revision with mobile Bearer and redacts provenance', async () => {
  const req = request();
  const response = await call('GET', req);
  expect(response.status).toBe(200);
  expect(mocks.client).toHaveBeenCalledWith(req);
  expect(mocks.read).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: expect.objectContaining({
        userId: 'synthetic-actor',
        wsId: 'resolved-workspace',
        product: 'mira',
      }),
      memoryId: memory.id,
    })
  );
  expect(await response.json()).toEqual({
    memory: { id: memory.id, content: memory.content, revision },
  });
});
it('edits in place and records a proper edit audit without private content', async () => {
  const response = await call(
    'PATCH',
    request('PATCH', { value: memory.content, revision })
  );
  expect(response.status).toBe(200);
  expect(mocks.edit).toHaveBeenCalledWith(
    expect.objectContaining({
      ignoreSettings: true,
      memoryId: memory.id,
      revision,
      value: memory.content,
    })
  );
  expect(mocks.rpc).toHaveBeenCalledWith(
    'record_ai_memory_audit',
    expect.objectContaining({
      p_action: 'edit',
      p_actor_user_id: 'synthetic-actor',
      p_user_id: 'synthetic-actor',
      p_ws_id: 'resolved-workspace',
      p_memory_id: memory.id,
    })
  );
  expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(memory.content);
  expect(await response.json()).toMatchObject({
    updated: true,
    auditRecorded: true,
  });
});
it.each(['GET', 'PATCH'] as const)(
  'retains cookie auth for %s',
  async (method) => {
    const req = request(
      method,
      method === 'PATCH' ? { value: memory.content, revision } : undefined,
      ''
    );
    req.headers.set('cookie', 'session=synthetic-valid');
    expect((await call(method, req)).status).toBe(200);
  }
);
it.each(['GET', 'PATCH'] as const)(
  'denies invalid Bearer before private %s',
  async (method) => {
    expect(
      (
        await call(
          method,
          request(
            method,
            method === 'PATCH'
              ? { value: memory.content, revision }
              : undefined,
            'Bearer invalid'
          )
        )
      ).status
    ).toBe(401);
    expect(mocks.member).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  }
);
it.each(['GET', 'PATCH'] as const)(
  'denies nonmember before private %s',
  async (method) => {
    mocks.member.mockResolvedValue({ ok: false });
    expect(
      (
        await call(
          method,
          request(
            method,
            method === 'PATCH' ? { value: memory.content, revision } : undefined
          )
        )
      ).status
    ).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  }
);
it('distinguishes membership lookup failure from permission denial', async () => {
  mocks.member.mockResolvedValue({
    ok: false,
    error: 'membership_lookup_failed',
  });
  expect(
    (await call('PATCH', request('PATCH', { value: memory.content, revision })))
      .status
  ).toBe(500);
  expect(mocks.edit).not.toHaveBeenCalled();
});
it.each([
  {},
  { value: '', revision },
  { value: 'x', revision: 'invalid' },
  { value: 'x', revision, userId: 'foreign' },
  { value: 'x'.repeat(20001), revision },
])('rejects invalid edit without metering: %j', async (body) => {
  expect((await call('PATCH', request('PATCH', body))).status).toBe(400);
  expect(mocks.edit).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('rejects unknown product instead of silently editing another scope', async () => {
  const req = request('PATCH', { value: memory.content, revision });
  const invalid = new NextRequest(
    req.url.replace('product=mira', 'product=unknown'),
    {
      method: 'PATCH',
      headers: req.headers,
      body: JSON.stringify({ value: memory.content, revision }),
    }
  );
  expect((await call('PATCH', invalid)).status).toBe(400);
  expect(mocks.edit).not.toHaveBeenCalled();
});
it.each([
  ['conflict', 409],
  ['not_found', 404],
  ['not_configured', 503],
  ['embedding_failed', 502],
  ['service_failed', 502],
] as const)('maps %s without audit success', async (reason, status) => {
  mocks.edit.mockResolvedValue({ ok: false, reason });
  const response = await call(
    'PATCH',
    request('PATCH', { value: memory.content, revision })
  );
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ reason });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(['error', 'throw', 'missing-receipt'])(
  'reports confirmed edit truthfully after audit %s',
  async (mode) => {
    if (mode === 'throw')
      mocks.rpc.mockRejectedValue(new Error('private SQL error'));
    else
      mocks.rpc.mockResolvedValue({
        data: null,
        error: mode === 'error' ? { message: 'private SQL error' } : null,
      });
    const response = await call(
      'PATCH',
      request('PATCH', { value: memory.content, revision })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      updated: true,
      auditRecorded: false,
      warning: 'audit_failed',
    });
    expect(JSON.stringify(data)).not.toContain('private SQL');
    expect(mocks.edit).toHaveBeenCalledTimes(1);
  }
);
it('keeps HEAD bodyless with GET status', async () => {
  expect((route as Record<string, unknown>).HEAD).toBeTypeOf('function');
  const response = await (
    route as unknown as {
      HEAD: (r: NextRequest, p: typeof params) => Promise<Response>;
    }
  ).HEAD(request(), params);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('');
});

it('admits MEMBER with the request client before creating admin access', async () => {
  await call('GET', request());
  const requestClient = await mocks.client.mock.results[0]?.value;
  expect(mocks.member).toHaveBeenCalledWith(
    expect.objectContaining({ supabase: requestClient })
  );
  expect(mocks.member.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.admin.mock.invocationCallOrder[0]!
  );
});
it.each(['unauthenticated', 'normalize', 'nonmember', 'lookup'])(
  'creates no admin access when admission fails: %s',
  async (mode) => {
    if (mode === 'normalize')
      mocks.normalize.mockRejectedValue(new Error('private workspace source'));
    if (mode === 'nonmember') mocks.member.mockResolvedValue({ ok: false });
    if (mode === 'lookup')
      mocks.member.mockResolvedValue({
        ok: false,
        error: 'membership_lookup_failed',
      });
    await call(
      'GET',
      request(
        'GET',
        undefined,
        mode === 'unauthenticated' ? 'invalid' : 'Bearer synthetic-valid'
      )
    );
    expect(mocks.admin).not.toHaveBeenCalled();
  }
);

it.each([true, false])(
  'protects PATCH content from caching with audit success=%s',
  async (auditSuccess) => {
    if (!auditSuccess)
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { message: 'synthetic audit failure' },
      });
    const response = await call(
      'PATCH',
      request('PATCH', { value: memory.content, revision })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      updated: true,
      memory: { content: memory.content },
      auditRecorded: auditSuccess,
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  }
);
