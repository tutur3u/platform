import { beforeEach, describe, expect, it, vi } from 'vitest';

const TARGET_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

const VALID_ROLE_FLAGS = {
  allow_challenge_management: true,
  allow_manage_all_challenges: false,
  allow_role_management: true,
  enabled: true,
};

const mocks = vi.hoisted(() => ({
  authorizeNovaRoleManager: vi.fn(),
  createAdminClient: vi.fn(),
  directAdminFrom: vi.fn(),
}));

vi.mock('@/lib/nova-team-api-auth', () => ({
  authorizeNovaRoleManager: mocks.authorizeNovaRoleManager,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

function routeParams(userId?: string) {
  return {
    params: Promise.resolve(userId === undefined ? {} : { userId }),
  } as never;
}

function putRequest(body: unknown) {
  return new Request(`http://localhost/api/v1/nova/users/${TARGET_USER_ID}`, {
    body: JSON.stringify(body),
    method: 'PUT',
  }) as never;
}

function createRoleClient({
  deleteError = null,
  updateError = null,
}: {
  deleteError?: { message: string } | null;
  updateError?: { message: string } | null;
} = {}) {
  const updateEq = vi.fn().mockResolvedValue({ error: updateError });
  const update = vi.fn(() => ({ eq: updateEq }));
  const deleteEq = vi.fn().mockResolvedValue({ error: deleteError });
  const deleteRoles = vi.fn(() => ({ eq: deleteEq }));
  const from = vi.fn(() => ({ delete: deleteRoles, update }));
  const sbAdmin = { from };

  return {
    deleteEq,
    deleteError,
    deleteRoles,
    from,
    sbAdmin,
    update,
    updateEq,
    updateError,
  };
}

function authorize(options?: Parameters<typeof createRoleClient>[0]) {
  const client = createRoleClient(options);
  mocks.authorizeNovaRoleManager.mockResolvedValue({
    ok: true,
    value: {
      privateDb: {},
      role: {
        allow_challenge_management: false,
        allow_manage_all_challenges: false,
        allow_role_management: true,
        enabled: true,
      },
      sbAdmin: client.sbAdmin,
      user: { id: 'manager-id' },
    },
  });

  return client;
}

function deny(status: 401 | 403) {
  mocks.authorizeNovaRoleManager.mockResolvedValue({
    ok: false,
    response: Response.json(
      { error: status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status }
    ),
  });
}

describe('Nova user role route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ from: mocks.directAdminFrom });
  });

  it('rejects anonymous PUT requests before parsing or querying', async () => {
    deny(401);
    const request = { json: vi.fn() };

    const { PUT } = await import('./route');
    const response = await PUT(request as never, routeParams(TARGET_USER_ID));

    expect(response.status).toBe(401);
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.directAdminFrom).not.toHaveBeenCalled();
  });

  it('rejects enabled users without role management before parsing or querying', async () => {
    deny(403);
    const request = { json: vi.fn() };

    const { PUT } = await import('./route');
    const response = await PUT(request as never, routeParams(TARGET_USER_ID));

    expect(response.status).toBe(403);
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.directAdminFrom).not.toHaveBeenCalled();
  });

  it('rejects disabled role managers before resolving params or querying', async () => {
    deny(403);
    let resolveParams: ((value: { userId: string }) => void) | undefined;
    const params = new Promise<{ userId: string }>((resolve) => {
      resolveParams = resolve;
    });

    const { DELETE } = await import('./route');
    const response = await DELETE({} as never, { params });

    expect(response.status).toBe(403);
    expect(resolveParams).toBeTypeOf('function');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.directAdminFrom).not.toHaveBeenCalled();
  });

  it('updates exactly the route-targeted user for an authorized manager', async () => {
    const client = authorize();

    const { PUT } = await import('./route');
    const response = await PUT(
      putRequest(VALID_ROLE_FLAGS),
      routeParams(TARGET_USER_ID)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(client.from).toHaveBeenCalledWith('platform_user_roles');
    expect(client.update).toHaveBeenCalledWith(VALID_ROLE_FLAGS);
    expect(client.updateEq).toHaveBeenCalledWith('user_id', TARGET_USER_ID);
  });

  it('rejects malformed JSON before querying', async () => {
    const client = authorize();
    const request = new Request(
      `http://localhost/api/v1/nova/users/${TARGET_USER_ID}`,
      { body: '{', method: 'PUT' }
    );

    const { PUT } = await import('./route');
    const response = await PUT(request as never, routeParams(TARGET_USER_ID));

    expect(response.status).toBe(400);
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each([
    ['PUT', 'not-a-uuid'],
    ['PUT', undefined],
    ['DELETE', 'not-a-uuid'],
    ['DELETE', undefined],
  ] as const)(
    'rejects an invalid or missing %s route user ID',
    async (method, userId) => {
      const client = authorize();
      const request: Record<string, unknown> =
        method === 'PUT'
          ? { json: vi.fn().mockResolvedValue(VALID_ROLE_FLAGS) }
          : {};
      const route = await import('./route');

      const response = await route[method](
        request as never,
        routeParams(userId)
      );

      expect(response.status).toBe(400);
      expect(client.from).not.toHaveBeenCalled();
      if (method === 'PUT')
        expect(request.json as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      'a body userId that differs from the path',
      { ...VALID_ROLE_FLAGS, userId: OTHER_USER_ID },
    ],
    [
      'a body userId that matches the path',
      { ...VALID_ROLE_FLAGS, userId: TARGET_USER_ID },
    ],
    ['an unknown field', { ...VALID_ROLE_FLAGS, unexpected: true }],
    [
      'a missing role flag',
      {
        allow_challenge_management: true,
        allow_manage_all_challenges: false,
        enabled: true,
      },
    ],
    ['a wrongly typed role flag', { ...VALID_ROLE_FLAGS, enabled: 'true' }],
  ])('rejects %s before querying', async (_, body) => {
    const client = authorize();

    const { PUT } = await import('./route');
    const response = await PUT(putRequest(body), routeParams(TARGET_USER_ID));

    expect(response.status).toBe(400);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('sanitizes role update database failures', async () => {
    const client = authorize({ updateError: { message: 'private detail' } });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const { PUT } = await import('./route');
    const response = await PUT(
      putRequest(VALID_ROLE_FLAGS),
      routeParams(TARGET_USER_ID)
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error updating user permissions',
    });
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to update Nova user permissions',
      client.updateError
    );
  });

  it('deletes exactly the route-targeted user for an authorized manager', async () => {
    const client = authorize();

    const { DELETE } = await import('./route');
    const response = await DELETE({} as never, routeParams(TARGET_USER_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(client.from).toHaveBeenCalledWith('platform_user_roles');
    expect(client.deleteRoles).toHaveBeenCalledOnce();
    expect(client.deleteEq).toHaveBeenCalledWith('user_id', TARGET_USER_ID);
  });

  it('sanitizes role deletion database failures', async () => {
    const client = authorize({ deleteError: { message: 'private detail' } });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const { DELETE } = await import('./route');
    const response = await DELETE({} as never, routeParams(TARGET_USER_ID));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error deleting user permissions',
    });
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to delete Nova user permissions',
      client.deleteError
    );
  });
});
