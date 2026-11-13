import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { GET as detail, PATCH } from './[documentId]/route';

const mocks = vi.hoisted(() => ({
  member: true,
  permission: true,
  enabled: false,
  user: true,
  query: {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    ilike: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  },
  from: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: mocks.user ? { id: 'actor' } : null,
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: async () => ({ from: mocks.from }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'workspace',
  verifyWorkspaceMembershipType: async () => ({ ok: mocks.member }),
  getPermissions: async () => ({ withoutPermission: () => !mocks.permission }),
}));
vi.mock('@tuturuuu/utils/feature-flags/core', () => ({
  getFeatureFlag: async () => mocks.enabled,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));
const params = {
  params: Promise.resolve({ wsId: 'workspace', documentId: 'document' }),
};
function request(body: unknown, method = 'PATCH') {
  return new Request(
    'https://example.test/api/v1/workspaces/workspace/documents',
    {
      method,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.member = true;
  mocks.permission = true;
  mocks.enabled = false;
  mocks.user = true;
  mocks.from.mockReturnValue(mocks.query);
  for (const key of [
    'select',
    'eq',
    'order',
    'ilike',
    'insert',
    'update',
  ] as const) {
    mocks.query[key].mockReturnValue(mocks.query);
  }
  mocks.query.range.mockResolvedValue({ data: [], count: 0 });
  mocks.query.single.mockResolvedValue({ data: { id: 'document' } });
  mocks.query.maybeSingle.mockResolvedValue({ data: { id: 'document' } });
});
describe('workspace document API boundary', () => {
  it.each(['ws_id', 'id', 'created_at', 'legacy_content', 'actor_id'])(
    'rejects protected %s in create and update',
    async (field) => {
      expect(
        (
          await POST(
            request({ name: 'Page', [field]: 'injected' }, 'POST'),
            params
          )
        ).status
      ).toBe(400);
      expect(
        (await PATCH(request({ name: 'Page', [field]: 'injected' }), params))
          .status
      ).toBe(400);
      expect(mocks.query.insert).not.toHaveBeenCalled();
      expect(mocks.query.update).not.toHaveBeenCalled();
    }
  );
  it.each([
    null,
    [],
    {},
    { is_public: 'true' },
    { parent_id: 'invalid' },
    { position: '1' },
    { position: 1.5 },
    { position: 2147483648 },
    { position: -2147483649 },
  ])('rejects malformed update %j', async (body) => {
    expect((await PATCH(request(body), params)).status).toBe(400);
    expect(mocks.query.update).not.toHaveBeenCalled();
  });
  it('returns 400 for malformed JSON', async () => {
    const req = new Request('https://example.test', {
      method: 'PATCH',
      body: '{',
    });
    expect((await PATCH(req, params)).status).toBe(400);
  });
  it.each([{ parent_id: null }, { position: 0 }, { position: null }])(
    'rejects hierarchy writes while disabled: %j',
    async (fields) => {
      expect((await PATCH(request(fields), params)).status).toBe(403);
      expect(
        (await POST(request({ name: 'Page', ...fields }, 'POST'), params))
          .status
      ).toBe(403);
      expect(mocks.query.insert).not.toHaveBeenCalled();
      expect(mocks.query.update).not.toHaveBeenCalled();
    }
  );
  it('preserves ordinary saves while disabled', async () => {
    const body = {
      name: 'Page',
      content: { type: 'doc', content: [] },
      is_public: false,
    };
    expect((await PATCH(request(body), params)).status).toBe(200);
    expect(mocks.query.update).toHaveBeenCalledWith(body);
    expect(mocks.query.eq).toHaveBeenCalledWith('ws_id', 'workspace');
    expect(mocks.query.eq).toHaveBeenCalledWith('id', 'document');
  });
  it('accepts enabled hierarchy fields with the server workspace', async () => {
    mocks.enabled = true;
    const body = {
      name: 'Child',
      parent_id: '11111111-1111-4111-8111-111111111111',
      position: 1,
    };
    expect((await POST(request(body, 'POST'), params)).status).toBe(200);
    expect(mocks.query.insert).toHaveBeenCalledWith({
      ...body,
      ws_id: 'workspace',
    });
    expect(
      (await PATCH(request({ parent_id: null, position: null }), params)).status
    ).toBe(200);
    expect(mocks.query.update).toHaveBeenCalledWith({
      parent_id: null,
      position: null,
    });
  });
  it.each([false, true])(
    'projects hierarchy only when enabled=%s',
    async (enabled) => {
      mocks.enabled = enabled;
      const req = new Request('https://example.test');
      await GET(req, params);
      await detail(req, params);
      const columns = enabled
        ? 'id, name, content, is_public, created_at, parent_id, position'
        : 'id, name, content, is_public, created_at';
      expect(mocks.query.select).toHaveBeenCalledWith(columns, {
        count: 'exact',
      });
      expect(mocks.query.select).toHaveBeenCalledWith(columns);
    }
  );
  it.each(['member', 'permission', 'user'] as const)(
    'denies access without %s',
    async (gate) => {
      mocks[gate] = false;
      const status = gate === 'user' ? 401 : 403;
      expect((await PATCH(request({ name: 'Page' }), params)).status).toBe(
        status
      );
      expect(
        (await POST(request({ name: 'Page' }, 'POST'), params)).status
      ).toBe(status);
      expect(
        (await GET(new Request('https://example.test'), params)).status
      ).toBe(status);
      expect(mocks.from).not.toHaveBeenCalled();
    }
  );
});
