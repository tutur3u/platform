import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  config: vi.fn(),
  admin: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: runtime.config,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: runtime.admin,
}));
vi.mock('./employee-creation-authorization', () => ({
  authorizeEmployeeCreation: runtime.authorize,
}));

import { makeEmployeeCreationObservation } from './employee-creation-observation';

const actor = '10000000-0000-4000-8000-000000000001';
const operationId = '10000000-0000-4000-8000-000000000002';
const target = '10000000-0000-4000-8000-000000000003';
const operation = {
  actorUserId: actor,
  operationId,
  targetUserId: target,
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  phase: 'activation_attempted',
  version: 6,
  leaseId: null,
  leaseExpiresAt: 0,
  revoked: false,
  lastReceipt: null,
};
const account = {
  id: target,
  email: operation.email,
  displayName: 'Staff',
  status: 'created',
};
const provider = {
  id: target,
  email: operation.email,
  email_confirmed_at: '2026-01-01',
  app_metadata: { employee_onboarding: true },
  banned_until: null,
};
const authorize = vi.fn();
const inspect = vi.fn();
const identity = vi.fn();
const connect = vi.fn();
const run = () =>
  makeEmployeeCreationObservation({ authorize, connect })(
    new Request('https://web.test/op'),
    operationId
  );
beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue({ authorized: true, actorUserId: actor });
  inspect.mockResolvedValue({ operation, account });
  identity.mockResolvedValue(provider);
  connect.mockResolvedValue({ inspect, identity });
});
it('confirms from independent provider then fresh SQL, reauthorizes and never needs a mutation port', async () => {
  const response = await run();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.json()).toEqual({
    status: 'created',
    operationId,
    account: { id: target, email: operation.email, displayName: 'Staff' },
  });
  expect(inspect).toHaveBeenCalledTimes(2);
  expect(identity).toHaveBeenCalledExactlyOnceWith(target);
  expect(inspect.mock.invocationCallOrder[0]).toBeLessThan(
    identity.mock.invocationCallOrder[0]!
  );
  expect(identity.mock.invocationCallOrder[0]).toBeLessThan(
    inspect.mock.invocationCallOrder[1]!
  );
  expect(authorize).toHaveBeenCalledTimes(2);
});
it.each([401, 403, 503])(
  'denies %s before opening the privileged port',
  async (status) => {
    authorize.mockResolvedValue({ authorized: false, status });
    expect((await run()).status).toBe(status);
    expect(connect).not.toHaveBeenCalled();
  }
);
it.each([
  { ...provider, id: actor },
  { ...provider, email: 'other@tuturuuu.com' },
  { ...provider, email_confirmed_at: 'bad' },
  { ...provider, app_metadata: {} },
  { ...provider, banned_until: '2999-01-01' },
  { ...provider, banned_until: 'bad' },
  null,
])('never confirms an unqualified provider identity %j', async (value) => {
  identity.mockResolvedValue(value);
  expect((await run()).status).toBe(202);
});
it.each([
  null,
  { ...account, id: actor },
  { ...account, email: 'other@tuturuuu.com' },
  { ...account, displayName: 'Other' },
  { ...account, status: 'pending' },
])('requires fresh SQL tuple %j', async (value) => {
  inspect
    .mockResolvedValueOnce({ operation, account })
    .mockResolvedValueOnce({ operation, account: value });
  expect((await run()).status).toBe(202);
});
it('does not disclose after final permission revocation or actor replacement', async () => {
  authorize
    .mockResolvedValueOnce({ authorized: true, actorUserId: actor })
    .mockResolvedValueOnce({ authorized: false, status: 403 });
  expect((await run()).status).toBe(403);
});
it.each([
  { ...operation, actorUserId: target },
  { ...operation, operationId: target },
])('rejects crossed operation %j', async (value) => {
  inspect.mockResolvedValue({ operation: value, account });
  expect((await run()).status).toBe(503);
  expect(identity).not.toHaveBeenCalled();
});
it('stops revoked operations without reading provider', async () => {
  inspect.mockResolvedValue({
    operation: { ...operation, revoked: true },
    account,
  });
  expect(await (await run()).json()).toMatchObject({
    status: 'stopped',
    code: 'employee_operation_revoked',
  });
  expect(identity).not.toHaveBeenCalled();
});
it('does not infer completion from absence or a failed read', async () => {
  inspect.mockResolvedValue({ operation: null, account: null });
  expect((await run()).status).toBe(202);
  inspect.mockRejectedValue(new Error('SQL unavailable'));
  expect((await run()).status).toBe(503);
});
it('rejects target replacement between independent observations', async () => {
  inspect.mockResolvedValueOnce({ operation, account }).mockResolvedValueOnce({
    operation: { ...operation, targetUserId: actor },
    account,
  });
  expect((await run()).status).toBe(503);
});

it('production composition issues only readiness/inspection RPCs and a provider get', async () => {
  const { observeEmployeeCreation } = await import(
    './employee-creation-observation'
  );
  runtime.config.mockReturnValue({
    url: 'https://synthetic.supabase.co',
    key: 'synthetic',
  });
  runtime.authorize.mockResolvedValue({
    authorized: true,
    actorUserId: actor,
  });
  const getUserById = vi.fn(async () => ({
    data: { user: provider },
    error: null,
  }));
  // Runtime port is intentionally narrower than a full Supabase client.
  const admin = { auth: { admin: { getUserById } } };
  runtime.admin.mockResolvedValue(admin);
  const transport = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith('/employee_creation_runtime_ready'))
      return Response.json({
        ready: true,
        contract: 'employee-http-rpc-v1',
        finalizeSha256: 'a'.repeat(64),
        confirmSha256: 'b'.repeat(64),
      });
    expect(String(url)).toBe(
      'https://synthetic.supabase.co/rest/v1/rpc/employee_creation_runtime_inspect'
    );
    return Response.json({ operation, account });
  });
  vi.stubGlobal('fetch', transport);
  try {
    expect(
      (
        await observeEmployeeCreation(
          new Request('https://web.test/op'),
          operationId
        )
      ).status
    ).toBe(200);
    expect(transport).toHaveBeenCalledTimes(4);
    expect(getUserById).toHaveBeenCalledExactlyOnceWith(target);
    for (const [, init] of transport.mock.calls)
      expect(init?.cache).toBe('no-store');
  } finally {
    vi.unstubAllGlobals();
  }
});
it('keeps an unknown Auth-attempt outcome incomplete without replay or a completion claim', async () => {
  inspect.mockResolvedValue({
    operation: { ...operation, phase: 'unknown', version: 2 },
    account: null,
  });
  const response = await run();
  expect(await response.json()).toEqual({
    status: 'stopped',
    operationId,
    code: 'employee_operation_halted',
  });
  expect(identity).not.toHaveBeenCalled();
});

it('observes terminal current name with separately bound original CREATE name', async () => {
  inspect.mockResolvedValue({
    operation: { ...operation, phase: 'active' },
    account: {
      ...account,
      displayName: 'Duyên Dương',
      creationDisplayName: 'Staff',
    },
  });
  const response = await run();
  expect(response.status).toBe(200);
  expect((await response.json()).account).toEqual({
    id: target,
    email: operation.email,
    displayName: 'Duyên Dương',
    creationDisplayName: 'Staff',
  });
});

it.each(['activation_attempted', 'unknown'])(
  'rejects renamed observation in %s',
  async (phase) => {
    inspect.mockResolvedValue({
      operation: { ...operation, phase },
      account: {
        ...account,
        displayName: 'Duyên Dương',
        creationDisplayName: 'Staff',
      },
    });
    const response = await run();
    expect((await response.json()).status).not.toBe('created');
  }
);

it('requires SQL provenance before accepting a changed observed name', async () => {
  inspect.mockResolvedValue({
    operation: { ...operation, phase: 'active' },
    account: { ...account, displayName: 'Duyên Dương' },
  });
  expect((await (await run()).json()).status).toBe('pending');
});
