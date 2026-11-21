import { AuthApiError } from '@tuturuuu/supabase/auth-errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type EmployeeCreationAuthorizer,
  makeEmployeeCreationHandler,
} from './employee-creation-http';
import {
  EmployeeCreationError,
  type EmployeeCreationInput,
  type EmployeeCreationOperations,
  type EmployeeCreationProvider,
} from './employee-creation-orchestration';

vi.mock('server-only', () => ({}));
const fixtureId = '00000000-0000-4000-8000-000000000001';
let targetId: string = fixtureId;
const actorId = '00000000-0000-4000-8000-000000000002';
const nextActorId = '00000000-0000-4000-8000-000000000003';
const secret = ' synthetic-password-sentinel ';
const diagnostic = 'synthetic-provider-diagnostic';
const body = {
  email: ' STAFF@TUTURUUU.COM ',
  displayName: ' Staff ',
  temporaryPassword: secret,
};
const account = {
  get id() {
    return targetId;
  },
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
};
type CreateReply = Awaited<ReturnType<EmployeeCreationProvider['createUser']>>;
type UpdateReply = Awaited<
  ReturnType<EmployeeCreationProvider['updateUserById']>
>;
type ReadReply = Awaited<ReturnType<EmployeeCreationProvider['getUserById']>>;
type ProviderUser = NonNullable<CreateReply['data']['user']>;
const banned: ProviderUser = {
  id: fixtureId,
  email: account.email,
  email_confirmed_at: '2026-01-01',
  banned_until: '2126-01-01',
  app_metadata: { employee_onboarding: true },
  user_metadata: { diagnostic },
  aud: 'authenticated',
  created_at: '2026-01-01',
};
const active: ProviderUser = { ...banned, banned_until: undefined };
const createOK = (user: ProviderUser): CreateReply => ({
  data: {
    get user() {
      return user.id === fixtureId ? { ...user, id: targetId } : user;
    },
  },
  error: null,
});
const updateOK = (user: ProviderUser): UpdateReply => ({
  data: {
    get user() {
      return user.id === fixtureId ? { ...user, id: targetId } : user;
    },
  },
  error: null,
});
const readOK = (user: ProviderUser): ReadReply => ({
  data: {
    get user() {
      return user.id === fixtureId ? { ...user, id: targetId } : user;
    },
  },
  error: null,
});

function fixture() {
  const order: string[] = [];
  // Native crypto is not mocked by the configured runner. Bind synthetic
  // acknowledgements to the actual reservation made for each fresh request.
  const preflight = vi.fn<EmployeeCreationOperations['preflight']>(
    async (args) => {
      targetId = args.userId;
      order.push('preflight');
      return { data: true, error: null };
    }
  );
  const finalize = vi.fn<EmployeeCreationOperations['finalize']>(async () => {
    order.push('finalize');
    return { data: { ...account, status: 'pending', diagnostic }, error: null };
  });
  const confirmActivation = vi.fn<
    EmployeeCreationOperations['confirmActivation']
  >(async () => {
    order.push('confirm');
    return {
      data: {
        ...account,
        status: 'created',
        temporaryPassword: secret,
        diagnostic,
      },
      error: null,
    };
  });
  const createUser = vi.fn<EmployeeCreationProvider['createUser']>(
    async function (
      this: EmployeeCreationProvider,
      _attributes: Parameters<EmployeeCreationProvider['createUser']>[0]
    ) {
      expect(this).toBe(provider);
      order.push('create');
      return createOK(banned);
    }
  );
  const updateUserById = vi.fn<EmployeeCreationProvider['updateUserById']>(
    async function (
      this: EmployeeCreationProvider,
      ..._args: Parameters<EmployeeCreationProvider['updateUserById']>
    ) {
      expect(this).toBe(provider);
      order.push('unban');
      return updateOK(active);
    }
  );
  const getUserById = vi.fn<EmployeeCreationProvider['getUserById']>(
    async function (
      this: EmployeeCreationProvider,
      ..._args: Parameters<EmployeeCreationProvider['getUserById']>
    ) {
      expect(this).toBe(provider);
      order.push('read');
      return readOK(active);
    }
  );
  const provider = {
    createUser,
    updateUserById,
    getUserById,
  } satisfies EmployeeCreationProvider;
  const operations = {
    preflight,
    finalize,
    confirmActivation,
  } satisfies EmployeeCreationOperations;
  const input = { actorUserId: actorId, provider, operations } satisfies Pick<
    EmployeeCreationInput,
    'actorUserId' | 'provider' | 'operations'
  >;
  const authorize = vi.fn<EmployeeCreationAuthorizer>(async () => {
    order.push('authorize');
    return { authorized: true, input };
  });
  return {
    order,
    input,
    authorize,
    preflight,
    finalize,
    confirmActivation,
    createUser,
    updateUserById,
    getUserById,
    handle: makeEmployeeCreationHandler(authorize),
  };
}
type Fixture = ReturnType<typeof fixture>;
function request(
  options: {
    method?: string;
    headers?: Record<string, string>;
    raw?: string;
  } = {}
) {
  const method = options.method ?? 'POST';
  return new Request('https://infrastructure.example/api/employees', {
    method,
    headers: {
      'content-type': 'application/json',
      'x-tuturuuu-account-action': '1',
      ...options.headers,
    },
    ...(method === 'GET' || method === 'HEAD'
      ? {}
      : { body: options.raw ?? JSON.stringify(body) }),
  });
}
function noEffects(f: Fixture) {
  for (const method of [
    f.preflight,
    f.createUser,
    f.finalize,
    f.updateUserById,
    f.getUserById,
    f.confirmActivation,
  ])
    expect(method).not.toHaveBeenCalled();
}
async function safeResponse(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect([...response.headers.keys()].sort()).toEqual([
    'cache-control',
    'content-type',
  ]);
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, max-age=0'
  );
  const text = await response.text();
  expect(text).not.toContain(secret);
  expect(text).not.toContain(diagnostic);
  return JSON.parse(text);
}

beforeEach(() => {
  targetId = fixtureId;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
  vi.spyOn(console, 'log');
  vi.spyOn(console, 'warn');
  vi.spyOn(console, 'error');
});
afterEach(() => {
  expect(console.log).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('unwired employee creation HTTP boundary through the actual service', () => {
  it('constructs without effects and rejects every unsupported method before authorization', async () => {
    const f = fixture();
    expect(f.order).toEqual([]);
    noEffects(f);
    for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(
        await safeResponse(await f.handle(request({ method })), 405)
      ).toEqual({ code: 'method_not_allowed', message: 'Method not allowed' });
    }
    expect(f.authorize).not.toHaveBeenCalled();
    noEffects(f);
  });

  it.each([401, 403, 503] satisfies Array<401 | 403 | 503>)(
    'reconstructs authorization denial %s without reading the body',
    async (status) => {
      const f = fixture();
      f.authorize.mockResolvedValue(
        Object.assign(
          { authorized: false, status } satisfies Awaited<
            ReturnType<EmployeeCreationAuthorizer>
          >,
          { message: diagnostic, headers: { 'set-cookie': secret } }
        )
      );
      const req = request({
        raw: '{',
        headers: { 'x-tuturuuu-account-action': 'bad' },
      });
      const json = vi.spyOn(req, 'json');
      await safeResponse(await f.handle(req), status);
      expect(f.authorize).toHaveBeenCalledExactlyOnceWith(req);
      expect(json).not.toHaveBeenCalled();
      noEffects(f);
    }
  );

  it('maps a rejected authorizer to fixed 503 even for a domain-shaped exception', async () => {
    const f = fixture();
    f.authorize.mockRejectedValue(
      new EmployeeCreationError(diagnostic, 409, 'employee_account_conflict')
    );
    expect(await safeResponse(await f.handle(request()), 503)).toEqual({
      code: 'employee_creation_unavailable',
      message: 'Employee creation is unavailable',
    });
    noEffects(f);
  });

  it('does not read diagnostic getters from a thrown authorizer error', async () => {
    const f = fixture();
    const getter = vi.fn(() => {
      throw new Error(secret);
    });
    const error = Object.defineProperties(new Error(), {
      message: { get: getter },
      code: { get: getter },
      status: { get: getter },
    });
    f.authorize.mockRejectedValue(error);
    await safeResponse(await f.handle(request()), 503);
    expect(getter).not.toHaveBeenCalled();
    noEffects(f);
  });

  it.each(['x-tuturuuu-account-action', 'content-type'])(
    'rejects missing %s after authorization',
    async (header) => {
      const f = fixture();
      const req = request();
      req.headers.delete(header);
      await safeResponse(
        await f.handle(req),
        header === 'content-type' ? 415 : 403
      );
      expect(f.order).toEqual(['authorize']);
      noEffects(f);
    }
  );

  it.each<Record<string, string>>([
    { 'x-tuturuuu-account-action': '' },
    { 'x-tuturuuu-account-action': '01' },
    { 'x-tuturuuu-account-action': '1, 1' },
    { origin: 'null' },
    { origin: 'https://foreign.example' },
    { 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'none' },
  ])(
    'authorizes before rejecting header %j without body/service work',
    async (headers) => {
      const f = fixture();
      const req = request({ headers });
      const json = vi.spyOn(req, 'json');
      await safeResponse(await f.handle(req), 403);
      expect(f.order).toEqual(['authorize']);
      expect(json).not.toHaveBeenCalled();
      noEffects(f);
    }
  );

  it.each(['', 'text/plain', 'application/jsonp'])(
    'rejects media %s after authorization',
    async (media) => {
      const f = fixture();
      const req = request({ headers: { 'content-type': media } });
      const json = vi.spyOn(req, 'json');
      await safeResponse(await f.handle(req), 415);
      expect(f.order).toEqual(['authorize']);
      expect(json).not.toHaveBeenCalled();
      noEffects(f);
    }
  );

  it.each([
    '{',
    'null',
    '[]',
    JSON.stringify({ ...body, email: 'staff@tuturuuu.com.evil' }),
    JSON.stringify({ ...body, email: 'bad email@tuturuuu.com' }),
    JSON.stringify({ ...body, email: `${'a'.repeat(310)}@tuturuuu.com` }),
    JSON.stringify({ ...body, displayName: ' ' }),
    JSON.stringify({ ...body, displayName: 'a'.repeat(101) }),
    JSON.stringify({ ...body, temporaryPassword: 'a'.repeat(11) }),
    JSON.stringify({ ...body, temporaryPassword: null }),
    JSON.stringify({ ...body, displayName: 42 }),
    JSON.stringify({ ...body, temporaryPassword: 'a'.repeat(73) }),
    ...[
      'actorUserId',
      'userId',
      'role',
      'grant',
      'operationId',
      'adopt',
      'recovery',
    ].map((key) => JSON.stringify({ ...body, [key]: diagnostic })),
  ])(
    'rejects strict malformed/extra input without any service effect',
    async (raw) => {
      const f = fixture();
      await safeResponse(await f.handle(request({ raw })), 400);
      expect(f.order).toEqual(['authorize']);
      noEffects(f);
    }
  );

  it('contains an unexpected body failure as 503 without serializing its diagnostic', async () => {
    const f = fixture();
    const req = request();
    vi.spyOn(req, 'json').mockRejectedValue(new Error(diagnostic));
    await safeResponse(await f.handle(req), 503);
    noEffects(f);
  });

  it.each<Record<string, string>>([
    {},
    {
      origin: 'https://infrastructure.example',
      'sec-fetch-site': 'same-origin',
    },
  ])(
    'creates only after the complete sequence, normalizes identity and preserves password',
    async (headers) => {
      const f = fixture();
      const output = await safeResponse(
        await f.handle(
          request({
            headers: {
              ...headers,
              'content-type': 'Application/JSON; charset=utf-8',
            },
          })
        ),
        201
      );
      expect(output).toEqual({ status: 'created', account });
      expect(f.order).toEqual([
        'authorize',
        'preflight',
        'create',
        'finalize',
        'unban',
        'read',
        'confirm',
      ]);
      const tuple = {
        actorUserId: actorId,
        userId: targetId,
        email: account.email,
        displayName: 'Staff',
      };
      expect(f.preflight).toHaveBeenCalledExactlyOnceWith(tuple);
      expect(f.finalize).toHaveBeenCalledExactlyOnceWith(tuple);
      expect(f.confirmActivation).toHaveBeenCalledExactlyOnceWith({
        actorUserId: actorId,
        userId: targetId,
        email: account.email,
      });
      expect(f.createUser).toHaveBeenCalledExactlyOnceWith({
        id: targetId,
        email: account.email,
        password: secret,
        email_confirm: true,
        ban_duration: '876000h',
        app_metadata: { employee_onboarding: true },
        user_metadata: { display_name: 'Staff', full_name: 'Staff' },
      });
      expect(f.updateUserById).toHaveBeenCalledExactlyOnceWith(targetId, {
        ban_duration: 'none',
      });
      expect(f.getUserById).toHaveBeenCalledExactlyOnceWith(targetId);
      expect(
        JSON.stringify([
          f.preflight.mock.calls,
          f.finalize.mock.calls,
          f.confirmActivation.mock.calls,
        ])
      ).not.toContain(secret);
    }
  );

  it('uses a different freshly authorized actor on each request', async () => {
    const first = fixture();
    const second = fixture();
    const authorize = vi
      .fn<EmployeeCreationAuthorizer>()
      .mockResolvedValueOnce({ authorized: true, input: first.input })
      .mockResolvedValueOnce({
        authorized: true,
        input: { ...second.input, actorUserId: nextActorId },
      });
    const handle = makeEmployeeCreationHandler(authorize);
    expect(authorize).not.toHaveBeenCalled();
    const one = request();
    const two = request();
    await safeResponse(await handle(one), 201);
    await safeResponse(await handle(two), 201);
    expect(authorize.mock.calls).toEqual([[one], [two]]);
    const reservations = [first, second].map(
      (f) => f.preflight.mock.calls[0]?.[0].userId
    );
    for (const id of reservations)
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    expect(reservations[0]).not.toBe(reservations[1]);
    const actors: [Fixture, string][] = [
      [first, actorId],
      [second, nextActorId],
    ];
    for (const [f, actorUserId] of actors) {
      for (const method of [f.preflight, f.finalize, f.confirmActivation])
        expect(method.mock.calls[0]?.[0].actorUserId).toBe(actorUserId);
    }
  });

  it.each(['23505', '42501', 'unexpected'])(
    'maps preflight %s to fixed code/status and stops',
    async (code) => {
      const f = fixture();
      f.preflight.mockResolvedValue({
        data: null,
        error: { code, message: diagnostic },
      });
      const status = code === '23505' ? 409 : code === '42501' ? 403 : 503;
      const output = await safeResponse(await f.handle(request()), status);
      expect(output).toEqual(
        code === '23505'
          ? {
              code: 'employee_account_conflict',
              message: 'The account already exists',
            }
          : {
              code: 'employee_creation_unavailable',
              message: 'Employee creation is unavailable',
            }
      );
      expect(f.createUser).not.toHaveBeenCalled();
      expect(f.finalize).not.toHaveBeenCalled();
      expect(f.updateUserById).not.toHaveBeenCalled();
      expect(f.getUserById).not.toHaveBeenCalled();
      expect(f.confirmActivation).not.toHaveBeenCalled();
    }
  );

  it('maps provider duplicate to 409 without finalization, unban or confirmation', async () => {
    const f = fixture();
    f.createUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError(diagnostic, 422, 'email_exists'),
    });
    await safeResponse(await f.handle(request()), 409);
    expect(f.finalize).not.toHaveBeenCalled();
    expect(f.updateUserById).not.toHaveBeenCalled();
    expect(f.getUserById).not.toHaveBeenCalled();
    expect(f.confirmActivation).not.toHaveBeenCalled();
  });

  it.each(['create', 'finalize', 'unban', 'read', 'confirm'])(
    'retains lost %s as pending without later effects',
    async (stage) => {
      const f = fixture();
      const failure = new Error(diagnostic);
      if (stage === 'create') f.createUser.mockRejectedValue(failure);
      if (stage === 'finalize') f.finalize.mockRejectedValue(failure);
      if (stage === 'unban') f.updateUserById.mockRejectedValue(failure);
      if (stage === 'read') f.getUserById.mockRejectedValue(failure);
      if (stage === 'confirm') f.confirmActivation.mockRejectedValue(failure);
      const output = await safeResponse(await f.handle(request()), 202);
      expect(output).toEqual({
        status: 'pending',
        code: 'account_creation_outcome_unknown',
        message:
          'Account creation is pending. Refresh the directory before retrying; do not submit another creation request.',
      });
      const methods = [
        f.createUser,
        f.finalize,
        f.updateUserById,
        f.getUserById,
        f.confirmActivation,
      ];
      const index = ['create', 'finalize', 'unban', 'read', 'confirm'].indexOf(
        stage
      );
      for (const [i, method] of methods.entries())
        expect(method).toHaveBeenCalledTimes(i <= index ? 1 : 0);
    }
  );

  it('contains malformed acknowledgements without permitting a later effect', async () => {
    const pre = fixture();
    pre.preflight.mockResolvedValue({ data: true });
    await safeResponse(await pre.handle(request()), 503);
    expect(pre.createUser).not.toHaveBeenCalled();
    expect(pre.finalize).not.toHaveBeenCalled();
    const post = fixture();
    post.finalize.mockImplementation(async () => ({
      data: { ...account, status: 'pending', displayName: 'Wrong' },
      error: null,
    }));
    await safeResponse(await post.handle(request()), 202);
    expect(post.updateUserById).not.toHaveBeenCalled();
    expect(post.getUserById).not.toHaveBeenCalled();
    expect(post.confirmActivation).not.toHaveBeenCalled();
  });

  it('retains acknowledged pending finalization as 202 without activation', async () => {
    const f = fixture();
    f.finalize.mockResolvedValue({
      data: null,
      error: { code: '23514', message: diagnostic },
    });
    expect((await safeResponse(await f.handle(request()), 202)).code).toBe(
      'employee_provisioning_pending'
    );
    expect(f.updateUserById).not.toHaveBeenCalled();
    expect(f.getUserById).not.toHaveBeenCalled();
    expect(f.confirmActivation).not.toHaveBeenCalled();
  });

  it('requires fresh active state and an exact final confirmation before 201', async () => {
    const f = fixture();
    f.getUserById.mockResolvedValue(readOK(banned));
    await safeResponse(await f.handle(request()), 202);
    expect(f.confirmActivation).not.toHaveBeenCalled();
    const wrong = fixture();
    wrong.confirmActivation.mockImplementation(async () => ({
      data: {
        ...account,
        status: 'created',
        email: 'other@tuturuuu.com',
        diagnostic,
      },
      error: null,
    }));
    await safeResponse(await wrong.handle(request()), 202);
    expect(wrong.createUser).toHaveBeenCalledTimes(1);
    expect(wrong.updateUserById).toHaveBeenCalledTimes(1);
  });
});
