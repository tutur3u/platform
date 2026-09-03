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
  | 'select'
  | 'eq'
  | 'is'
  | 'insert'
  | 'delete'
  | 'maybeSingle'
  | 'single'
  | 'then',
  ReturnType<typeof vi.fn>
>;
function builder(terminal: 'maybeSingle' | 'single' | 'then', result: unknown) {
  const value = {} as Builder;
  for (const method of ['select', 'eq', 'is', 'insert', 'delete'] as const)
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
  projectId: '11111111-1111-4111-8111-111111111111',
  updateId: '22222222-2222-4222-8222-222222222222',
  wsId: 'personal',
};
const params = Promise.resolve(routeParams);

describe('task project update reactions route', () => {
  let parent: Builder;
  let reaction: Builder;
  let supabase: { from: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    parent = builder('maybeSingle', { data: { id: 'update-1' }, error: null });
    reaction = builder('single', { data: { id: 'reaction-1' }, error: null });
    supabase = {
      from: vi.fn((table: string) =>
        table === 'task_project_updates' ? parent : reaction
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

  const methods = [
    [
      'POST',
      async () => {
        const { POST } = await import('./route');
        return POST(
          new Request('http://localhost/reactions', {
            method: 'POST',
            body: JSON.stringify({ emoji: '👍' }),
          }) as never,
          { params }
        );
      },
    ],
    [
      'DELETE',
      async () => {
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
        reaction.then = vi.fn((resolve) =>
          Promise.resolve({ error: null }).then(resolve)
        );
        const { DELETE } = await import('./route');
        return DELETE(
          new Request('http://localhost/reactions?emoji=%F0%9F%91%8D', {
            method: 'DELETE',
          }) as never,
          { params }
        );
      },
    ],
  ] as const;

  it.each(methods)('%s rejects unauthenticated callers', async (_, call) => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: new Error('no'),
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
    expect(reaction.insert).not.toHaveBeenCalled();
    expect(reaction.delete).not.toHaveBeenCalled();
  });

  it.each(methods)(
    '%s hides foreign project, workspace, missing, or deleted parents',
    async (_, call) => {
      parent.maybeSingle.mockResolvedValue({ data: null, error: null });
      const response = await call();
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Update not found' });
      expect(parent.eq).toHaveBeenCalledWith('id', routeParams.updateId);
      expect(parent.eq).toHaveBeenCalledWith(
        'project_id',
        routeParams.projectId
      );
      expect(parent.eq).toHaveBeenCalledWith(
        'task_projects.ws_id',
        'ws-normalized'
      );
      expect(parent.is).toHaveBeenCalledWith('deleted_at', null);
      expect(reaction.insert).not.toHaveBeenCalled();
      expect(reaction.delete).not.toHaveBeenCalled();
    }
  );

  it('POST authorizes cookie sessions and inserts under the bound update', async () => {
    const { POST } = await import('./route');
    const request = new Request('http://localhost/reactions', {
      method: 'POST',
      body: JSON.stringify({ emoji: '👍' }),
      headers: { cookie: 'sb-access-token=session' },
    });
    const response = await POST(request as never, { params });
    expect(response.status).toBe(201);
    expect(mocks.resolveAuthenticatedSessionUser).toHaveBeenCalledWith(request);
    expect(mocks.membership).toHaveBeenCalledWith({
      supabase,
      userId: 'user-1',
      wsId: 'ws-normalized',
    });
    expect(reaction.insert).toHaveBeenCalledWith({
      emoji: '👍',
      update_id: routeParams.updateId,
      user_id: 'user-1',
    });
  });

  it('POST maps duplicate reactions to a conflict', async () => {
    reaction.single.mockResolvedValue({
      data: null,
      error: { code: '23505' },
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/reactions', {
        method: 'POST',
        body: JSON.stringify({ emoji: '👍' }),
      }) as never,
      { params }
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Already reacted with this emoji',
    });
  });

  it('POST rejects an invalid emoji', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/reactions', {
        method: 'POST',
        body: JSON.stringify({ emoji: 'not-an-emoji' }),
      }) as never,
      { params }
    );

    expect(response.status).toBe(400);
    expect(reaction.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', 'http://localhost/reactions'],
    ['invalid', 'http://localhost/reactions?emoji=not-an-emoji'],
  ])('DELETE rejects a %s emoji parameter', async (_, url) => {
    const { DELETE } = await import('./route');
    const response = await DELETE(
      new Request(url, { method: 'DELETE' }) as never,
      { params }
    );

    expect(response.status).toBe(400);
    expect(reaction.delete).not.toHaveBeenCalled();
  });

  it('DELETE authorizes Tasks app sessions and scopes the deletion', async () => {
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
    reaction.then = vi.fn((resolve) =>
      Promise.resolve({ error: null }).then(resolve)
    );
    const { DELETE } = await import('./route');
    const request = new Request(
      'http://localhost/reactions?emoji=%F0%9F%91%8D',
      {
        method: 'DELETE',
        headers: { cookie: 'tuturuuu_app_session=token' },
      }
    );
    const response = await DELETE(request as never, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(reaction.eq).toHaveBeenCalledWith('update_id', routeParams.updateId);
    expect(reaction.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(reaction.eq).toHaveBeenCalledWith('emoji', '👍');
  });
});
