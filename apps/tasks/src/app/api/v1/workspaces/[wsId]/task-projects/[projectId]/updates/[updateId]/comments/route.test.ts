import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.membership,
}));

type Builder = Record<
  'select' | 'eq' | 'is' | 'order' | 'insert' | 'maybeSingle' | 'single',
  ReturnType<typeof vi.fn>
>;

function createBuilder(terminal: 'maybeSingle' | 'single', result: unknown) {
  const builder = {} as Builder;
  for (const method of ['select', 'eq', 'is', 'order', 'insert'] as const) {
    builder[method] = vi.fn(() => builder);
  }
  builder[terminal] = vi.fn(async () => result);
  builder.maybeSingle ??= vi.fn();
  builder.single ??= vi.fn();
  return builder;
}

const params = Promise.resolve({
  projectId: '11111111-1111-4111-8111-111111111111',
  updateId: '22222222-2222-4222-8222-222222222222',
  wsId: 'personal',
});

describe('task project update comments collection route', () => {
  let parent: Builder;
  let comments: Builder;
  let supabase: { from: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    parent = createBuilder('maybeSingle', {
      data: { id: 'update-1' },
      error: null,
    });
    comments = createBuilder('single', {
      data: { id: 'comment-1' },
      error: null,
    });
    comments.order = vi.fn(async () => ({ data: [], error: null }));
    supabase = {
      from: vi.fn((table: string) =>
        table === 'task_project_updates' ? parent : comments
      ),
    };
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      supabase,
      user: { id: 'user-1' },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-normalized');
    mocks.membership.mockResolvedValue({ ok: true });
  });

  const methodCases = [
    [
      'GET',
      async () => {
        const { GET } = await import('./route');
        return GET(new Request('http://localhost/comments') as never, {
          params,
        });
      },
    ],
    [
      'POST',
      async () => {
        const { POST } = await import('./route');
        return POST(
          new Request('http://localhost/comments', {
            body: JSON.stringify({ content: 'Hello' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }) as never,
          { params }
        );
      },
    ],
  ] as const;

  it.each(methodCases)(
    '%s rejects unauthenticated callers',
    async (_, call) => {
      mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
        authError: new Error('unauthorized'),
        supabase: null,
        user: null,
      });

      const response = await call();

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
      expect(supabase.from).not.toHaveBeenCalled();
    }
  );

  it.each(methodCases)(
    '%s surfaces membership lookup failure',
    async (_, call) => {
      mocks.membership.mockResolvedValue({
        error: 'membership_lookup_failed',
        ok: false,
      });

      const response = await call();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'Failed to verify workspace access',
      });
      expect(supabase.from).not.toHaveBeenCalled();
    }
  );

  it.each(methodCases)(
    '%s rejects route-workspace non-members',
    async (_, call) => {
      mocks.membership.mockResolvedValue({ ok: false });

      const response = await call();

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      expect(supabase.from).not.toHaveBeenCalled();
    }
  );

  it.each(methodCases)(
    '%s surfaces update lookup failures',
    async (_, call) => {
      parent.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'lookup failed' },
      });

      const response = await call();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to load update' });
    }
  );

  it.each(methodCases)(
    '%s returns the same 404 for a missing or mismatched parent',
    async (_, call) => {
      parent.maybeSingle.mockResolvedValue({ data: null, error: null });

      const response = await call();

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Update not found' });
      expect(parent.eq).toHaveBeenCalledWith(
        'id',
        '22222222-2222-4222-8222-222222222222'
      );
      expect(parent.eq).toHaveBeenCalledWith(
        'project_id',
        '11111111-1111-4111-8111-111111111111'
      );
      expect(parent.eq).toHaveBeenCalledWith(
        'task_projects.ws_id',
        'ws-normalized'
      );
      expect(parent.is).toHaveBeenCalledWith('deleted_at', null);
      expect(comments.insert).not.toHaveBeenCalled();
      expect(comments.order).not.toHaveBeenCalled();
    }
  );

  it('GET authorizes a cookie session and returns scoped comments', async () => {
    comments.order.mockResolvedValue({ data: [], error: null });
    const { GET } = await import('./route');
    const request = new Request('http://localhost/comments', {
      headers: { cookie: 'sb-access-token=session' },
    });

    const response = await GET(request as never, { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ comments: [] });
    expect(mocks.resolveAuthenticatedSessionUser).toHaveBeenCalledWith(request);
    expect(mocks.membership).toHaveBeenCalledWith({
      supabase,
      userId: 'user-1',
      wsId: 'ws-normalized',
    });
    expect(comments.eq).toHaveBeenCalledWith(
      'update_id',
      '22222222-2222-4222-8222-222222222222'
    );
  });

  it('POST authorizes a Tasks app session and creates under the bound update', async () => {
    const { POST } = await import('./route');
    const request = new Request('http://localhost/comments', {
      body: JSON.stringify({ content: 'Hello' }),
      headers: {
        'Content-Type': 'application/json',
        cookie: 'tuturuuu_app_session=token',
      },
      method: 'POST',
    });

    const response = await POST(request as never, { params });

    expect(response.status).toBe(201);
    expect(mocks.resolveAuthenticatedSessionUser).toHaveBeenCalledWith(request);
    expect(comments.insert).toHaveBeenCalledWith({
      content: 'Hello',
      parent_id: null,
      update_id: '22222222-2222-4222-8222-222222222222',
      user_id: 'user-1',
    });
  });
});
