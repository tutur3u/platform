import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
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
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));

type Builder = Record<
  'select' | 'eq' | 'is' | 'update' | 'maybeSingle' | 'single' | 'then',
  ReturnType<typeof vi.fn>
>;
function builder(terminal: 'maybeSingle' | 'single' | 'then', result: unknown) {
  const value = {} as Builder;
  for (const method of ['select', 'eq', 'is', 'update'] as const)
    value[method] = vi.fn(() => value);
  if (terminal === 'then') {
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
    value.then = vi.fn((resolve) => Promise.resolve(result).then(resolve));
  } else value[terminal] = vi.fn(async () => result);
  value.maybeSingle ??= vi.fn();
  value.single ??= vi.fn();
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
  value.then ??= vi.fn();
  return value;
}

const routeParams = {
  commentId: '33333333-3333-4333-8333-333333333333',
  projectId: '11111111-1111-4111-8111-111111111111',
  updateId: '22222222-2222-4222-8222-222222222222',
  wsId: 'personal',
};
const params = Promise.resolve(routeParams);

describe('task project update comment item route', () => {
  let parent: Builder;
  let lookup: Builder;
  let mutation: Builder;
  let adminMutation: Builder;
  let supabase: { from: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    parent = builder('maybeSingle', { data: { id: 'update-1' }, error: null });
    lookup = builder('single', {
      data: { id: routeParams.commentId, user_id: 'user-1' },
      error: null,
    });
    mutation = builder('single', {
      data: { id: routeParams.commentId, content: 'Updated' },
      error: null,
    });
    const commentBuilders = [lookup, mutation];
    supabase = {
      from: vi.fn((table: string) =>
        table === 'task_project_updates' ? parent : commentBuilders.shift()
      ),
    };
    adminMutation = builder('then', { error: null });
    mocks.admin.mockResolvedValue({ from: vi.fn(() => adminMutation) });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      supabase,
      user: { id: 'user-1' },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-normalized');
    mocks.membership.mockResolvedValue({ ok: true });
  });

  const methods = [
    [
      'PATCH',
      async () => {
        const { PATCH } = await import('./route');
        return PATCH(
          new Request('http://localhost/comment', {
            method: 'PATCH',
            body: JSON.stringify({ content: 'Updated' }),
          }) as never,
          { params }
        );
      },
    ],
    [
      'DELETE',
      async () => {
        const { DELETE } = await import('./route');
        return DELETE(
          new Request('http://localhost/comment', {
            method: 'DELETE',
          }) as never,
          { params }
        );
      },
    ],
  ] as const;

  it.each(methods)('%s rejects unauthenticated callers', async (_, call) => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: new Error('unauthorized'),
      supabase: null,
      user: null,
    });
    const response = await call();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it.each(methods)('%s surfaces membership lookup failure', async (_, call) => {
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
  });

  it.each(methods)(
    '%s rejects route-workspace non-members',
    async (_, call) => {
      mocks.membership.mockResolvedValue({ ok: false });
      const response = await call();
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      expect(supabase.from).not.toHaveBeenCalled();
    }
  );

  it.each(methods)('%s surfaces update lookup failure', async (_, call) => {
    parent.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'failed' },
    });
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to load update' });
    expect(lookup.single).not.toHaveBeenCalled();
  });

  it.each(methods)(
    '%s hides foreign, missing, or deleted update parents',
    async (_, call) => {
      parent.maybeSingle.mockResolvedValue({ data: null, error: null });
      const response = await call();
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Update not found' });
      expect(parent.eq).toHaveBeenCalledWith(
        'project_id',
        routeParams.projectId
      );
      expect(parent.eq).toHaveBeenCalledWith(
        'task_projects.ws_id',
        'ws-normalized'
      );
      expect(parent.is).toHaveBeenCalledWith('deleted_at', null);
      expect(lookup.single).not.toHaveBeenCalled();
    }
  );

  it.each(methods)(
    '%s rejects a comment from another update before mutation',
    async (_, call) => {
      lookup.single.mockResolvedValue({ data: null, error: null });
      const response = await call();
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Comment not found' });
      expect(lookup.eq).toHaveBeenCalledWith('id', routeParams.commentId);
      expect(lookup.eq).toHaveBeenCalledWith('update_id', routeParams.updateId);
      expect(mutation.update).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    }
  );

  it('PATCH binds both lookup and final mutation to the route update', async () => {
    const { PATCH } = await import('./route');
    const request = new Request('http://localhost/comment', {
      method: 'PATCH',
      body: JSON.stringify({ content: 'Updated' }),
      headers: { cookie: 'sb-access-token=session' },
    });
    const response = await PATCH(request as never, { params });
    expect(response.status).toBe(200);
    expect(mocks.resolveAuthenticatedSessionUser).toHaveBeenCalledWith(request);
    expect(mutation.eq).toHaveBeenCalledWith('id', routeParams.commentId);
    expect(mutation.eq).toHaveBeenCalledWith('update_id', routeParams.updateId);
    expect(mutation.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('DELETE preserves creator checks and binds the final mutation', async () => {
    const { DELETE } = await import('./route');
    const response = await DELETE(
      new Request('http://localhost/comment', {
        method: 'DELETE',
        headers: { cookie: 'tuturuuu_app_session=token' },
      }) as never,
      { params }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(adminMutation.eq).toHaveBeenCalledWith('id', routeParams.commentId);
    expect(adminMutation.eq).toHaveBeenCalledWith(
      'update_id',
      routeParams.updateId
    );
    expect(adminMutation.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(adminMutation.is).toHaveBeenCalledWith('deleted_at', null);
  });
});
