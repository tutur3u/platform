import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getUserById: vi.fn(),
  createAdmin: vi.fn(),
  transport: vi.fn<typeof fetch>(),
}));
vi.mock('@/lib/infrastructure/employee-creation-authorization', () => ({
  authorizeEmployeeCreation: mocks.authorize,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdmin,
}));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: () => ({ url: 'https://project.test', key: 'synthetic' }),
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));

import { GET } from './route';

const actor = '10000000-0000-4000-8000-000000000001';
const target = '10000000-0000-4000-8000-000000000002';
const email = 'restore-fixture@tuturuuu.com';
const operationId = '10000000-0000-4000-8000-000000000003';
const user = {
  id: target,
  email,
  identities: [
    {
      id: 'fixture-identity',
      identity_id: 'fixture-identity',
      user_id: target,
      provider: 'email',
      identity_data: {},
    },
  ],
  email_confirmed_at: '2026-01-01T00:00:00Z',
  banned_until: '2126-01-01T00:00:00Z',
  app_metadata: { employee_onboarding: true },
};
const inspection = {
  id: target,
  email,
  registryState: 'active',
  managedName: 'Fixture',
  managementRoleLabel: null,
  revision: 0,
  mailboxReady: true,
  readinessCode: 'ready',
  reservation: 'exact_intent',
  managed: true,
  operation: null,
  recovery: { email: 'recovery@example.test', verified: true },
};
function request(userId = target) {
  return GET(new Request(`https://web.test/api/employees/${userId}`), {
    params: Promise.resolve({ userId }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ authorized: true, actorUserId: actor });
  mocks.createAdmin.mockResolvedValue({
    auth: { admin: { getUserById: mocks.getUserById } },
  });
  mocks.getUserById.mockImplementation(async (id: string) => ({
    data: {
      user: id === actor ? { ...user, id: actor, banned_until: null } : user,
    },
    error: null,
  }));
  mocks.transport.mockResolvedValue(Response.json(inspection));
  vi.stubGlobal('fetch', mocks.transport);
});

it('serves the native inspection contract for the exact stable UUID without provider writes', async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, max-age=0'
  );
  expect(await response.json()).toEqual({
    ...inspection,
    providerState: 'confirmed_banned',
    providerReadAt: expect.any(String),
    nextAction: 'restore',
  });
  expect(mocks.authorize).toHaveBeenCalledTimes(3);
  expect(mocks.getUserById.mock.calls.map(([id]) => id)).toEqual([
    actor,
    target,
  ]);
  expect(mocks.transport).toHaveBeenCalledTimes(1);
  const [url, init] = mocks.transport.mock.calls[0]!;
  expect(String(url)).toBe(
    'https://project.test/rest/v1/rpc/inspect_employee_management'
  );
  expect(JSON.parse(String(init?.body))).toEqual({
    p_actor_id: actor,
    p_user_id: target,
    p_email: email,
  });
  expect(new Headers(init?.headers).get('Content-Profile')).toBe('private');
});

it.each([401, 403, 503])(
  'denies %s before any target or SQL read',
  async (status) => {
    mocks.authorize.mockResolvedValue({ authorized: false, status });
    expect((await request()).status).toBe(status);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.transport).not.toHaveBeenCalled();
  }
);

it('rejects an invalid target before obtaining the admin client', async () => {
  expect((await request('invalid')).status).toBe(400);
  expect(mocks.createAdmin).not.toHaveBeenCalled();
});

it('rejects self actions without a target or SQL read', async () => {
  expect((await request(actor)).status).toBe(409);
  expect(mocks.getUserById).not.toHaveBeenCalled();
  expect(mocks.transport).not.toHaveBeenCalled();
});

it('retains an unresolved operation for inspection without relaunching it', async () => {
  mocks.transport.mockResolvedValue(
    Response.json({
      ...inspection,
      operation: { operationId, revision: 0, phase: 'attempted' },
    })
  );
  expect(await (await request()).json()).toMatchObject({
    operation: { operationId, phase: 'attempted' },
    nextAction: 'inspect',
  });
  expect(mocks.transport).toHaveBeenCalledTimes(1);
});

it.each(['before-sql', 'before-disclosure'])(
  'denies changed actor %s',
  async (stage) => {
    mocks.authorize.mockResolvedValueOnce({
      authorized: true,
      actorUserId: actor,
    });
    if (stage === 'before-disclosure')
      mocks.authorize.mockResolvedValueOnce({
        authorized: true,
        actorUserId: actor,
      });
    mocks.authorize.mockResolvedValue({
      authorized: true,
      actorUserId: target,
    });
    const response = await request();
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('recovery@example.test');
    expect(mocks.transport).toHaveBeenCalledTimes(
      stage === 'before-sql' ? 0 : 1
    );
  }
);

it.each([
  { ...inspection, id: actor },
  { ...inspection, email: 'different@tuturuuu.com' },
  { ...inspection, revision: '0' },
  { ...inspection, leakedCredential: 'private-diagnostic' },
])('rejects an invalid or unbound SQL observation', async (value) => {
  mocks.transport.mockResolvedValue(Response.json(value));
  const response = await request();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('recovery@example.test');
});

it('does not retry or expose diagnostics after an unavailable SQL read', async () => {
  mocks.transport.mockRejectedValue(new Error('private-diagnostic'));
  const response = await request();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private-diagnostic');
  expect(mocks.transport).toHaveBeenCalledTimes(1);
});

it('rejects a provider response for a different stable UUID before SQL', async () => {
  mocks.getUserById.mockImplementation(async (id: string) => ({
    data: {
      user: {
        ...user,
        id: actor,
        banned_until: id === actor ? null : user.banned_until,
      },
    },
    error: null,
  }));
  expect((await request()).status).toBe(409);
  expect(mocks.transport).not.toHaveBeenCalled();
});

it('requires manual review when the provider identity is missing but registry state remains', async () => {
  mocks.getUserById.mockImplementation(async (id: string) => ({
    data: {
      user: id === actor ? { ...user, id: actor, banned_until: null } : null,
    },
    error: null,
  }));
  expect(await (await request()).json()).toMatchObject({
    id: target,
    providerState: 'missing',
    nextAction: 'manual_review',
  });
  expect(
    JSON.parse(String(mocks.transport.mock.calls[0]?.[1]?.body)).p_email
  ).toBeNull();
});

it('returns not found only after provider and SQL both establish absence', async () => {
  mocks.getUserById.mockImplementation(async (id: string) => ({
    data: {
      user: id === actor ? { ...user, id: actor, banned_until: null } : null,
    },
    error: null,
  }));
  mocks.transport.mockResolvedValue(
    Response.json({
      ...inspection,
      email: null,
      registryState: 'absent',
      reservation: 'none',
      managed: false,
      mailboxReady: false,
      readinessCode: 'not_managed',
      revision: null,
      recovery: null,
    })
  );
  expect((await request()).status).toBe(404);
});

it('does not label an unmanaged legacy address as restorable', async () => {
  const legacyEmail = 'legacy-fixture@xwf.tuturuuu.com';
  mocks.getUserById.mockImplementation(async (id: string) => ({
    data: {
      user:
        id === actor
          ? { ...user, id: actor, banned_until: null }
          : { ...user, email: legacyEmail, app_metadata: {} },
    },
    error: null,
  }));
  mocks.transport.mockResolvedValue(
    Response.json({
      ...inspection,
      email: legacyEmail,
      registryState: 'absent',
      reservation: 'none',
      managed: false,
      mailboxReady: false,
      readinessCode: 'not_managed',
      revision: null,
      recovery: null,
    })
  );
  expect(await (await request()).json()).toMatchObject({
    id: target,
    email: legacyEmail,
    nextAction: 'adoption_required',
  });
});
