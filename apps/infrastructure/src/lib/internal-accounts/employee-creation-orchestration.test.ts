import { AuthApiError } from '@tuturuuu/supabase/auth-errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmployeeAccount,
  EmployeeCreationError,
  type EmployeeCreationInput,
  type EmployeeCreationOperations,
  type EmployeeCreationProvider,
} from './employee-creation-orchestration';

vi.mock('server-only', () => ({}));
const fixtureId = '00000000-0000-4000-8000-000000000001';
let targetId = fixtureId;
const otherId = '00000000-0000-4000-8000-000000000002';
const now = Date.parse('2026-01-01T00:00:00Z');
const secret = 'synthetic-password-sentinel';
const input = {
  actorUserId: '00000000-0000-4000-8000-000000000003',
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  temporaryPassword: secret,
};
type ProviderReply = Awaited<
  ReturnType<EmployeeCreationProvider['createUser']>
>;
type ProviderUser = NonNullable<ProviderReply['data']['user']>;
const pendingUser: ProviderUser = {
  id: fixtureId,
  email: input.email,
  email_confirmed_at: '2026-01-01',
  banned_until: '2126-01-01',
  app_metadata: { employee_onboarding: true },
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01',
};
const activeUser: ProviderUser = { ...pendingUser, banned_until: undefined };
const account = {
  get id() {
    return targetId;
  },
  email: input.email,
  displayName: input.displayName,
};
const tuple = {
  actorUserId: input.actorUserId,
  get userId() {
    return targetId;
  },
  email: input.email,
  displayName: input.displayName,
};
const ok = (user: ProviderUser): ProviderReply => ({
  data: {
    get user() {
      return user.id === fixtureId ? { ...user, id: targetId } : user;
    },
  },
  error: null,
});
const failure = (code = 'unexpected_failure'): ProviderReply => ({
  data: { user: null },
  error: new AuthApiError(secret, 500, code),
});
// Deliberately malformed wire ACK, outside the SDK's success union. Decode as
// transport data to preserve the donor's missing-user/no-error regression.
const missingUserReply = () =>
  JSON.parse('{"data":{"user":null},"error":null}');
const unknownPending = {
  status: 'pending',
  code: 'account_creation_outcome_unknown',
};

// Native Node crypto bindings are not mocked by this configured runner. Keep
// synthetic replies bound to the actual preflight reservation, while explicit
// other-id faults stay invalid. Read the id when the operation executes.
function replyForReservedId(reply: unknown): unknown {
  if (
    typeof reply !== 'object' ||
    reply === null ||
    !Object.hasOwn(reply, 'data')
  )
    return reply;
  const data = (reply as { data: unknown }).data;
  if (
    typeof data !== 'object' ||
    data === null ||
    !Object.hasOwn(data, 'id') ||
    (data as { id: unknown }).id !== fixtureId
  )
    return reply;
  return { ...reply, data: { ...data, id: targetId } };
}

function fixture() {
  const order: string[] = [];
  const preflight = vi.fn<EmployeeCreationOperations['preflight']>(
    async (args) => {
      targetId = args.userId;
      order.push('preflight');
      return { data: true, error: null };
    }
  );
  const finalize = vi.fn<EmployeeCreationOperations['finalize']>(async () => {
    order.push('finalize');
    return { data: { ...account, status: 'pending' }, error: null };
  });
  const confirmActivation = vi.fn<
    EmployeeCreationOperations['confirmActivation']
  >(async () => {
    order.push('confirm');
    return { data: { ...account, status: 'created' }, error: null };
  });
  const createUser = vi.fn<EmployeeCreationProvider['createUser']>(
    async function (
      this: EmployeeCreationProvider,
      _attributes: Parameters<EmployeeCreationProvider['createUser']>[0]
    ) {
      expect(this).toBe(provider);
      order.push('create');
      return ok(pendingUser);
    }
  );
  const updateUserById = vi.fn<EmployeeCreationProvider['updateUserById']>(
    async function (
      this: EmployeeCreationProvider,
      ..._args: Parameters<EmployeeCreationProvider['updateUserById']>
    ) {
      expect(this).toBe(provider);
      order.push('unban');
      return ok(activeUser);
    }
  );
  const getUserById = vi.fn<EmployeeCreationProvider['getUserById']>(
    async function (
      this: EmployeeCreationProvider,
      ..._args: Parameters<EmployeeCreationProvider['getUserById']>
    ) {
      expect(this).toBe(provider);
      order.push('read');
      return ok(activeUser);
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
  const request = {
    ...input,
    provider,
    operations,
  } satisfies EmployeeCreationInput;
  return {
    request,
    order,
    preflight,
    finalize,
    confirmActivation,
    createUser,
    updateUserById,
    getUserById,
  };
}
type Fixture = ReturnType<typeof fixture>;
function calls(f: Fixture, expected: number[]) {
  const methods = [
    f.preflight,
    f.createUser,
    f.finalize,
    f.updateUserById,
    f.getUserById,
    f.confirmActivation,
  ];
  methods.forEach((method, index) => {
    expect(method).toHaveBeenCalledTimes(expected[index]!);
  });
  for (const method of [f.preflight, f.finalize, f.confirmActivation]) {
    expect(JSON.stringify(method.mock.calls)).not.toContain(secret);
  }
}
async function pendingResult(
  f: Fixture,
  expected: number[],
  code = unknownPending.code
) {
  const result = await createEmployeeAccount(f.request);
  expect(result).toMatchObject({ status: 'pending', code });
  expect(JSON.stringify(result)).not.toContain(secret);
  calls(f, expected);
}
const malformedEnvelopes: unknown[] = [
  null,
  undefined,
  true,
  {},
  { error: null },
  { data: true },
  { data: true, error: 'raw-secret' },
  { data: true, error: { code: 503 } },
  Object.create({ data: true, error: null }),
  Object.assign(Object.create({ error: null }), { data: true }),
  Object.assign(Object.create({ data: true }), { error: null }),
];
const identityFaults: Partial<ProviderUser>[] = [
  { id: otherId },
  { email: 'other@tuturuuu.com' },
  { email_confirmed_at: undefined },
  { app_metadata: {} },
  { app_metadata: { employee_onboarding: false } },
  { app_metadata: { employee_onboarding: 'true' } },
];
const tupleFaults = [
  null,
  {},
  { ...account, id: otherId },
  { ...account, email: 'other@tuturuuu.com' },
  { ...account, displayName: 'Other' },
];

describe('unwired employee creation orchestration', () => {
  beforeEach(() => {
    targetId = fixtureId;
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.spyOn(console, 'log');
    vi.spyOn(console, 'warn');
    vi.spyOn(console, 'error');
  });
  afterEach(() => {
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it('creates once, finalizes, unbans, reads independently and confirms', async () => {
    const f = fixture();
    f.confirmActivation.mockImplementationOnce(async () => {
      f.order.push('confirm');
      return {
        data: { ...account, status: 'created', password: secret },
        error: null,
        diagnostics: secret,
      };
    });
    expect(await createEmployeeAccount(f.request)).toEqual({
      status: 'created',
      account,
    });
    expect(f.order).toEqual([
      'preflight',
      'create',
      'finalize',
      'unban',
      'read',
      'confirm',
    ]);
    expect(f.createUser).toHaveBeenCalledExactlyOnceWith({
      id: targetId,
      email: input.email,
      password: secret,
      email_confirm: true,
      ban_duration: '876000h',
      app_metadata: { employee_onboarding: true },
      user_metadata: {
        display_name: input.displayName,
        full_name: input.displayName,
      },
    });
    expect(f.preflight).toHaveBeenCalledExactlyOnceWith(tuple);
    expect(f.finalize).toHaveBeenCalledExactlyOnceWith(tuple);
    expect(f.confirmActivation).toHaveBeenCalledExactlyOnceWith({
      actorUserId: input.actorUserId,
      userId: targetId,
      email: input.email,
    });
    expect(f.updateUserById).toHaveBeenCalledExactlyOnceWith(targetId, {
      ban_duration: 'none',
    });
    expect(f.getUserById).toHaveBeenCalledExactlyOnceWith(targetId);
    calls(f, [1, 1, 1, 1, 1, 1]);
  });
  it.each([
    { code: '23505', status: 409 },
    { code: '42501', status: 403 },
    { code: 'unexpected', status: 503 },
  ])('rejects preflight %s safely before create', async ({ code, status }) => {
    const f = fixture();
    f.preflight.mockResolvedValueOnce({
      data: null,
      error: { code, message: secret },
    });
    await expect(createEmployeeAccount(f.request)).rejects.toMatchObject({
      status,
    });
    calls(f, [1, 0, 0, 0, 0, 0]);
  });
  it.each([...malformedEnvelopes, { data: false, error: null }])(
    'rejects malformed or negative preflight %#',
    async (reply) => {
      const f = fixture();
      f.preflight.mockResolvedValueOnce(reply);
      await expect(createEmployeeAccount(f.request)).rejects.toMatchObject({
        status: 503,
      });
      calls(f, [1, 0, 0, 0, 0, 0]);
    }
  );
  it('sanitizes a thrown preflight diagnostic', async () => {
    const f = fixture();
    f.preflight.mockRejectedValueOnce(new Error(secret));
    await expect(createEmployeeAccount(f.request)).rejects.toEqual(
      new EmployeeCreationError(
        'Employee creation is unavailable',
        503,
        'employee_creation_unavailable'
      )
    );
    calls(f, [1, 0, 0, 0, 0, 0]);
  });
  it.each(['throw', 'error', 'missing'])(
    'retains create %s without retry',
    async (mode) => {
      const f = fixture();
      if (mode === 'throw')
        f.createUser.mockRejectedValueOnce(new Error(secret));
      if (mode === 'error') f.createUser.mockResolvedValueOnce(failure());
      if (mode === 'missing')
        f.createUser.mockResolvedValueOnce(missingUserReply());
      await pendingResult(f, [1, 1, 0, 0, 0, 0]);
    }
  );
  it.each(['email_exists', 'user_already_exists'])(
    'does not adopt duplicate %s',
    async (code) => {
      const f = fixture();
      f.createUser.mockResolvedValueOnce(failure(code));
      await expect(createEmployeeAccount(f.request)).rejects.toMatchObject({
        status: 409,
        code: 'employee_account_conflict',
        message: 'The account already exists',
      });
      calls(f, [1, 1, 0, 0, 0, 0]);
    }
  );
  it.each([
    ...identityFaults,
    ...[undefined, 'invalid', '2026-01-01T00:00:00Z', '2025-01-01'].map(
      (banned_until) => ({ banned_until })
    ),
  ])('stops on untrusted created identity %#', async (patch) => {
    const f = fixture();
    f.createUser.mockResolvedValueOnce(ok({ ...pendingUser, ...patch }));
    await pendingResult(f, [1, 1, 0, 0, 0, 0]);
  });
  it.each(['23505', '23514', '23503', '42501', 'P0002'])(
    'keeps definite finalize %s provisioning pending',
    async (code) => {
      const f = fixture();
      f.finalize.mockResolvedValueOnce({
        data: null,
        error: { code, message: secret },
      });
      await pendingResult(
        f,
        [1, 1, 1, 0, 0, 0],
        'employee_provisioning_pending'
      );
    }
  );
  it.each([
    ...malformedEnvelopes,
    { data: null, error: { code: 'unknown', message: secret } },
    ...tupleFaults.map((data) => ({
      data: data && { ...data, status: 'pending' },
      error: null,
    })),
    { data: { ...account, status: 'created' }, error: null },
  ])('retains unknown finalize %# and never activates', async (reply) => {
    const f = fixture();
    f.finalize.mockImplementationOnce(async () => replyForReservedId(reply));
    await pendingResult(f, [1, 1, 1, 0, 0, 0]);
  });
  it('retains lost finalize without activation or retry', async () => {
    const f = fixture();
    f.finalize.mockRejectedValueOnce(new Error(secret));
    await pendingResult(f, [1, 1, 1, 0, 0, 0]);
  });
  it.each(['throw', 'error', 'missing', 'wrong-id'])(
    'stops at unban %s',
    async (mode) => {
      const f = fixture();
      if (mode === 'throw')
        f.updateUserById.mockRejectedValueOnce(new Error(secret));
      if (mode === 'error') f.updateUserById.mockResolvedValueOnce(failure());
      if (mode === 'missing')
        f.updateUserById.mockResolvedValueOnce(missingUserReply());
      if (mode === 'wrong-id')
        f.updateUserById.mockResolvedValueOnce(
          ok({ ...activeUser, id: otherId })
        );
      await pendingResult(f, [1, 1, 1, 1, 0, 0]);
    }
  );
  it.each(['throw', 'error', 'missing'])(
    'stops at independent read %s',
    async (mode) => {
      const f = fixture();
      if (mode === 'throw')
        f.getUserById.mockRejectedValueOnce(new Error(secret));
      if (mode === 'error')
        f.getUserById.mockResolvedValueOnce(failure('timeout'));
      if (mode === 'missing')
        f.getUserById.mockResolvedValueOnce(missingUserReply());
      await pendingResult(f, [1, 1, 1, 1, 1, 0]);
    }
  );
  it.each([
    ...identityFaults,
    { banned_until: '2126-01-01' },
    { banned_until: 'invalid' },
  ])('requires fresh confirmed marked unbanned identity %#', async (patch) => {
    const f = fixture();
    f.getUserById.mockResolvedValueOnce(ok({ ...activeUser, ...patch }));
    await pendingResult(f, [1, 1, 1, 1, 1, 0]);
  });
  it.each([undefined, '2025-01-01', '2026-01-01T00:00:00Z'])(
    'allows absent, past or equal-now fresh ban %#',
    async (banned_until) => {
      const f = fixture();
      f.getUserById.mockResolvedValueOnce(ok({ ...activeUser, banned_until }));
      expect(await createEmployeeAccount(f.request)).toEqual({
        status: 'created',
        account,
      });
      calls(f, [1, 1, 1, 1, 1, 1]);
    }
  );
  it.each([
    ...malformedEnvelopes,
    { data: null, error: { code: 'timeout', message: secret } },
    ...tupleFaults.map((data) => ({
      data: data && { ...data, status: 'created' },
      error: null,
    })),
    { data: { ...account, status: 'pending' }, error: null },
  ])(
    'never reports created without exact SQL confirmation %#',
    async (reply) => {
      const f = fixture();
      f.confirmActivation.mockImplementationOnce(async () =>
        replyForReservedId(reply)
      );
      await pendingResult(f, [1, 1, 1, 1, 1, 1]);
    }
  );
  it('retains lost confirm without another provider effect', async () => {
    const f = fixture();
    f.confirmActivation.mockRejectedValueOnce(new Error(secret));
    await pendingResult(f, [1, 1, 1, 1, 1, 1]);
  });
});
