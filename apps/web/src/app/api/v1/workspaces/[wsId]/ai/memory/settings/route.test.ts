import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookie: false,
  createClient: vi.fn(),
  membership: vi.fn(),
  scope: vi.fn(),
  rpc: vi.fn(),
  memory: vi.fn(),
  normalized: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
  createAdminClient: () => ({ schema: () => ({ rpc: mocks.rpc }) }),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async (client: { user: unknown }) => ({
    user: client.user,
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalized,
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('@tuturuuu/ai/memory', () => ({
  AI_MEMORY_PRODUCTS: ['mira', 'memories'],
  resolveAiMemoryScope: mocks.scope,
  listAiMemories: mocks.memory,
  searchAiMemories: mocks.memory,
  rememberAiMemory: mocks.memory,
  forgetAiMemory: mocks.memory,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { POST as exportItems } from '../export/route';
import { DELETE as remove } from '../items/[memoryId]/route';
import { POST as createItem, GET as items } from '../items/route';
import { GET, HEAD, PATCH } from './route';

const actor = { id: 'synthetic-user' };
const context = {
  params: Promise.resolve({
    wsId: 'synthetic-workspace',
    memoryId: 'synthetic-memory',
  }),
};
const cases: {
  name: string;
  method: string;
  handler: (request: NextRequest, params: typeof context) => Promise<Response>;
  body?: Record<string, unknown>;
}[] = [
  { name: 'settings read', method: 'GET', handler: GET },
  {
    name: 'settings update',
    method: 'PATCH',
    handler: PATCH,
    body: { enabled: false },
  },
  { name: 'memory list', method: 'GET', handler: items },
  {
    name: 'memory create',
    method: 'POST',
    handler: createItem,
    body: { value: 'Synthetic preference' },
  },
  { name: 'memory delete', method: 'DELETE', handler: remove },
  { name: 'memory export', method: 'POST', handler: exportItems },
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookie = false;
  mocks.createClient.mockImplementation(async (request?: Request) => ({
    // Model the actual createClient contract: absent request sees cookies only.
    user:
      request?.headers.get('authorization') === 'Bearer synthetic-valid' ||
      request?.headers.get('cookie') === 'synthetic-cookie=valid' ||
      (!request && mocks.cookie)
        ? actor
        : null,
  }));
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.normalized.mockResolvedValue('resolved-workspace');
  mocks.scope.mockImplementation((scope) => scope);
  mocks.rpc.mockResolvedValue({
    data: [{ enabled: false, products: {} }],
    error: null,
  });
  mocks.memory.mockResolvedValue({ ok: true, value: [] });
});
it.each(cases)(
  'forwards mobile Bearer authentication for $name',
  async ({ handler, method, body }) => {
    const request = new NextRequest('https://example.test/api?product=mira', {
      method,
      headers: {
        authorization: 'Bearer synthetic-valid',
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const response = await handler(request, context);
    expect(response.status).toBe(200);
    expect(mocks.createClient).toHaveBeenCalledWith(request);
    expect(mocks.membership).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: actor.id,
        wsId: 'resolved-workspace',
        requiredType: 'MEMBER',
      })
    );
  }
);
it.each(cases)(
  'retains cookie authentication for $name',
  async ({ handler, method, body }) => {
    mocks.cookie = true;
    const request = new NextRequest('https://example.test/api', {
      method,
      headers: {
        cookie: 'synthetic-cookie=valid',
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect((await handler(request, context)).status).toBe(200);
  }
);
it.each(cases)(
  'rejects invalid credentials before private access for $name',
  async ({ handler, method, body }) => {
    const request = new NextRequest('https://example.test/api', {
      method,
      headers: {
        authorization: 'Bearer synthetic-invalid',
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect((await handler(request, context)).status).toBe(401);
    expect(mocks.membership).not.toHaveBeenCalled();
    expect(mocks.memory).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  }
);
it.each(cases)(
  'denies non-member access for $name',
  async ({ handler, method, body }) => {
    mocks.membership.mockResolvedValue({ ok: false });
    const request = new NextRequest('https://example.test/api', {
      method,
      headers: {
        authorization: 'Bearer synthetic-valid',
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect((await handler(request, context)).status).toBe(403);
    expect(mocks.memory).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  }
);
it('keeps deletion available when memory collection is disabled, scoped to the actor', async () => {
  const request = new NextRequest('https://example.test/api?product=mira', {
    method: 'DELETE',
    headers: { authorization: 'Bearer synthetic-valid' },
  });
  await remove(request, context);
  expect(mocks.memory).toHaveBeenCalledWith(
    expect.objectContaining({
      ignoreSettings: true,
      memoryId: 'synthetic-memory',
      scope: expect.objectContaining({
        userId: actor.id,
        wsId: 'resolved-workspace',
      }),
    })
  );
});

it('preserves explicit HEAD status and headers without a response body', async () => {
  const request = new NextRequest('https://example.test/api', {
    headers: { authorization: 'Bearer synthetic-valid' },
  });
  const response = await HEAD(request, context);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(await response.text()).toBe('');
});
