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
  viewerFrom: vi.fn(),
  viewerQuery: {
    select: vi.fn(),
    in: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  },
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: mocks.user ? { id: 'actor' } : null,
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({ from: mocks.viewerFrom }),
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
  mocks.viewerFrom.mockReturnValue(mocks.viewerQuery);
  mocks.viewerQuery.select.mockReturnValue(mocks.viewerQuery);
  mocks.viewerQuery.eq.mockReturnValue(mocks.viewerQuery);
  mocks.viewerQuery.in.mockResolvedValue({ data: [], error: null });
  mocks.viewerQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
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
  it.each([
    'ws_id',
    'id',
    'created_at',
    'updated_at',
    'owner_id',
    'legacy_content',
    'actor_id',
  ])('rejects protected %s in create and update', async (field) => {
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
  });
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
      owner_id: 'actor',
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
        ? 'id, name, content, is_public, created_at, updated_at, owner_id, parent_id, position'
        : 'id, name, content, is_public, created_at, updated_at, owner_id';
      expect(mocks.query.select).toHaveBeenCalledWith(columns, {
        count: 'exact',
      });
      expect(mocks.query.select).toHaveBeenCalledWith(columns);
    }
  );
  it('shows the display name through the viewer and omits the email', async () => {
    mocks.query.range.mockResolvedValue({
      data: [
        {
          id: 'document',
          name: 'Roadmap',
          owner_id: 'former-member',
        },
      ],
      count: 1,
    });
    mocks.viewerQuery.in.mockResolvedValue({
      data: [{ user_id: 'former-member', full_name: 'Ada Lovelace' }],
      error: null,
    });

    const response = await GET(new Request('https://example.test'), params);
    const body = await response.json();

    expect(mocks.viewerQuery.select).toHaveBeenCalledWith('user_id, full_name');
    expect(mocks.from).not.toHaveBeenCalledWith('user_private_details');
    expect(body.data[0].owner).toEqual({
      user_id: 'former-member',
      full_name: 'Ada Lovelace',
    });
    expect(body.data[0].owner.email).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('email');
  });
  it('hides a former member the viewer profile policy does not return', async () => {
    mocks.query.range.mockResolvedValue({
      data: [{ id: 'document', name: 'Roadmap', owner_id: 'former-member' }],
      count: 1,
    });
    mocks.query.maybeSingle.mockResolvedValue({
      data: { id: 'document', name: 'Roadmap', owner_id: 'former-member' },
    });
    mocks.viewerQuery.in.mockResolvedValue({ data: [], error: null });
    mocks.viewerQuery.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const listed = await GET(new Request('https://example.test'), params);
    const detailResponse = await detail(
      new Request('https://example.test'),
      params
    );
    const listBody = await listed.json();
    const detailBody = await detailResponse.json();

    expect(listBody.data[0].owner).toBeNull();
    expect(detailBody.data.owner).toBeNull();
    expect(JSON.stringify({ listBody, detailBody })).not.toContain('email');
  });
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

describe('workspace document schema compatibility', () => {
  const readRequest = new Request(
    'https://example.test?search=road&limit=5&offset=10'
  );
  const createdAt = '2026-11-20T00:00:00Z';
  const row = { id: 'document', name: 'Roadmap', created_at: createdAt };
  const missingOwner = {
    code: 'PGRST204',
    message:
      "Could not find the 'owner_id' column of 'workspace_documents' in the schema cache",
  };

  it.each([
    { handler: GET, query: 'range', list: true, errorStatus: 500 },
    { handler: detail, query: 'maybeSingle', list: false, errorStatus: 400 },
  ] as const)(
    'handles schema differences for $query',
    async ({ handler, query, list, errorStatus }) => {
      const terminal = mocks.query[query];
      const current = {
        ...row,
        updated_at: '2026-11-21T00:00:00Z',
        owner_id: 'actor',
      };
      const result = (document: typeof row) => ({
        data: list ? [document] : document,
        count: 37,
        error: null,
      });
      mocks.query.order.mockClear();
      terminal.mockResolvedValueOnce(result(current));
      const currentResponse = await handler(readRequest, params);
      const currentBody = await currentResponse.json();
      expect(currentResponse.status).toBe(200);
      expect(list ? currentBody.data[0] : currentBody.data).toMatchObject({
        updated_at: current.updated_at,
        owner_id: 'actor',
        owner_is_viewer: true,
      });
      expect(terminal).toHaveBeenCalledTimes(1);
      if (list) {
        expect(mocks.query.order.mock.calls).toEqual([
          ['updated_at', { ascending: false }],
          ['id', { ascending: false }],
        ]);
      }
      terminal.mockClear();

      for (const error of [
        { ...missingOwner, code: '42501' },
        {
          code: '42703',
          message: 'column workspace_documents.parent_id does not exist',
        },
        {
          code: 'PGRST200',
          message: 'Could not find a relationship in the schema cache',
        },
      ]) {
        terminal.mockResolvedValueOnce({ data: null, error });
        expect((await handler(readRequest, params)).status).toBe(errorStatus);
        expect(terminal).toHaveBeenCalledTimes(1);
        terminal.mockClear();
      }

      mocks.enabled = true;
      mocks.query.select.mockClear();
      terminal
        .mockResolvedValueOnce({
          data: null,
          error: {
            code: list ? '42703' : 'PGRST200',
            message: 'column workspace_documents.updated_at does not exist',
          },
        })
        .mockResolvedValueOnce(result(row));
      const legacyResponse = await handler(readRequest, params);
      const legacyBody = await legacyResponse.json();
      expect(legacyResponse.status).toBe(200);
      expect(list ? legacyBody.data[0] : legacyBody.data).toMatchObject({
        updated_at: createdAt,
        owner_id: null,
        owner: null,
        owner_is_viewer: false,
      });
      expect(terminal).toHaveBeenCalledTimes(2);
      const legacyProjection =
        'id, name, content, is_public, created_at, parent_id, position';
      if (list) {
        expect(mocks.query.select).toHaveBeenLastCalledWith(legacyProjection, {
          count: 'exact',
        });
        expect(mocks.query.order).toHaveBeenCalledWith('created_at', {
          ascending: false,
        });
        expect(mocks.query.range).toHaveBeenLastCalledWith(10, 14);
        expect(mocks.query.ilike).toHaveBeenLastCalledWith('name', '%road%');
        expect(legacyBody.pagination).toEqual({
          limit: 5,
          offset: 10,
          filteredTotal: 37,
        });
      } else {
        expect(mocks.query.select).toHaveBeenLastCalledWith(legacyProjection);
      }
    }
  );

  it('retries create once only for a missing owner column', async () => {
    const create = () => POST(request({ name: 'Page' }, 'POST'), params);
    expect((await create()).status).toBe(200);
    expect(mocks.query.insert).toHaveBeenCalledExactlyOnceWith({
      name: 'Page',
      ws_id: 'workspace',
      owner_id: 'actor',
    });
    mocks.query.insert.mockClear();

    for (const error of [
      { ...missingOwner, code: '42501' },
      {
        code: '42703',
        message: 'column workspace_documents.updated_at does not exist',
      },
    ]) {
      mocks.query.single.mockResolvedValueOnce({ data: null, error });
      expect((await create()).status).toBe(500);
      expect(mocks.query.insert).toHaveBeenCalledTimes(1);
      mocks.query.insert.mockClear();
    }

    mocks.query.single.mockResolvedValueOnce({
      data: null,
      error: missingOwner,
    });
    const response = await create();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: 'document',
      message: 'success',
    });
    expect(mocks.query.insert).toHaveBeenCalledTimes(2);
    expect(mocks.query.insert).toHaveBeenLastCalledWith({
      name: 'Page',
      ws_id: 'workspace',
    });
  });
});
