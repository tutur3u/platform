import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  config: vi.fn(),
  admin: vi.fn(),
  current: vi.fn(),
  mfa: vi.fn(),
  inspect: vi.fn(),
  ready: vi.fn(),
  identity: vi.fn(),
  rejection: vi.fn(),
  journal: vi.fn(),
  mutation: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: mock.config,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mock.admin,
}));
vi.mock('@tuturuuu/utils/required-mfa-app-session', () => ({
  isRequiredMfaAppSessionAllowed: mock.mfa,
}));
vi.mock('./employee-creation-authorization', () => ({
  authorizeCurrentEmployeeActor: mock.current,
  authorizeEmployeeCreation: vi.fn(() => {
    throw new Error('Infra authorization must not be used');
  }),
}));
vi.mock('./employee-creation-rpc', async (original) => ({
  ...(await original<typeof import('./employee-creation-rpc')>()),
  createEmployeeRuntimeRpc: () => ({
    ready: mock.ready,
    inspect: mock.inspect,
    claim: mock.mutation,
    provision: mock.mutation,
  }),
}));
vi.mock('./employee-rejection-boundary', () => ({
  connectEmployeeRejection: mock.rejection,
}));
vi.mock('./employee-creation-runtime', () => ({
  createEmployeeRuntimeJournal: mock.journal,
}));

import { GET } from '../../app/api/v1/infrastructure/internal-accounts/employees/operations/[operationId]/cli-recovery/route';

const actor = '10000000-0000-4000-8000-000000000001';
const operationId = '10000000-0000-4000-8000-000000000002';
const target = '10000000-0000-4000-8000-000000000003';
const secret = 'synthetic-cli-outcome-secret';
const claims = { userId: actor, email: 'admin@tuturuuu.com' };
const operation = {
  actorUserId: actor,
  operationId,
  targetUserId: target,
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  phase: 'active',
  version: 7,
  leaseId: null,
  leaseExpiresAt: 0,
  revoked: false,
  lastReceipt: null,
};
const account = {
  id: target,
  email: operation.email,
  displayName: operation.displayName,
  status: 'created',
};
const provider = {
  id: target,
  email: operation.email,
  email_confirmed_at: '2026-01-01',
  app_metadata: { employee_onboarding: true },
  banned_until: null,
};
const token = () => createCliAppSession(claims, { secret }).access.token;
function run(
  bearer: string | null = token(),
  key = operationId,
  origin?: string,
  view = '?view=outcome'
) {
  const headers = new Headers({ 'Idempotency-Key': key });
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  if (origin) headers.set('origin', origin);
  return GET(
    new Request(
      `https://web.test/api/v1/infrastructure/internal-accounts/employees/operations/${operationId}/cli-recovery${view}`,
      { headers }
    ),
    { params: Promise.resolve({ operationId }) }
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', secret);
  mock.mfa.mockResolvedValue(true);
  mock.current.mockResolvedValue({ authorized: true, actorUserId: actor });
  mock.inspect.mockResolvedValue({ operation, account });
  mock.identity.mockResolvedValue({ data: { user: provider }, error: null });
  mock.admin.mockResolvedValue({
    auth: {
      admin: {
        getUserById: mock.identity,
        createUser: mock.mutation,
        updateUserById: mock.mutation,
      },
    },
  });
});
afterEach(() => {
  expect(mock.mutation).not.toHaveBeenCalled();
  expect(mock.journal).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});
it('actual GET accepts the existing CLI access credential, reads provider then fresh SQL and reauthorizes', async () => {
  const response = await run();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: 'created',
    operationId,
    account: {
      id: target,
      email: operation.email,
      displayName: operation.displayName,
    },
  });
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(mock.inspect).toHaveBeenNthCalledWith(1, actor, operationId);
  expect(mock.inspect).toHaveBeenCalledTimes(2);
  expect(mock.ready).toHaveBeenCalledTimes(2);
  expect(mock.identity).toHaveBeenCalledExactlyOnceWith(target);
  expect(mock.inspect.mock.invocationCallOrder[0]).toBeLessThan(
    mock.identity.mock.invocationCallOrder[0]!
  );
  expect(mock.identity.mock.invocationCallOrder[0]).toBeLessThan(
    mock.inspect.mock.invocationCallOrder[1]!
  );
  expect(mock.current).toHaveBeenCalledTimes(2);
  expect(mock.current).toHaveBeenCalledWith(
    expect.any(Request),
    { id: actor, email: claims.email },
    { requireMatchingEmail: true }
  );
  expect(mock.rejection).not.toHaveBeenCalled();
});
it('rejects missing, refresh, wrong target/scope/origin, signature and expired credentials before SQL', async () => {
  for (const bearer of [
    null,
    createCliAppSession(claims, { secret }).refresh.token,
    createAppSessionToken(
      {
        ...claims,
        targetApp: 'infra',
        originApp: 'cli',
        scopes: ['cli:access'],
      },
      { secret }
    ).token,
    createAppSessionToken(
      { ...claims, targetApp: 'platform', originApp: 'cli', scopes: [] },
      { secret }
    ).token,
    createAppSessionToken(
      {
        ...claims,
        targetApp: 'platform',
        originApp: 'infra',
        scopes: ['cli:access'],
      },
      { secret }
    ).token,
    createCliAppSession(claims, { secret: 'wrong' }).access.token,
    createCliAppSession(claims, { secret, now: new Date('2000-01-01') }).access
      .token,
  ]) {
    expect((await run(bearer)).status).toBe(401);
  }
  expect(mock.inspect).not.toHaveBeenCalled();
});
it('preserves current MFA, root permission and canonical email denials', async () => {
  mock.mfa.mockResolvedValue(false);
  expect((await run()).status).toBe(403);
  mock.mfa.mockResolvedValue(true);
  for (const status of [401, 403, 503]) {
    mock.current.mockResolvedValue({ authorized: false, status });
    expect((await run()).status).toBe(status);
  }
  expect(mock.inspect).not.toHaveBeenCalled();
});
it('requires the original key and allowed request origin', async () => {
  expect((await run(token(), target)).status).toBe(403);
  expect((await run(token(), operationId, 'https://foreign.test')).status).toBe(
    403
  );
  expect(mock.inspect).not.toHaveBeenCalled();
});
it.each([
  { ...operation, operationId: target },
  { ...operation, actorUserId: target },
])(
  'fences foreign operation/actor before provider disclosure',
  async (foreign) => {
    mock.inspect.mockResolvedValue({ operation: foreign, account });
    expect((await run()).status).toBe(503);
    expect(mock.identity).not.toHaveBeenCalled();
  }
);
it('keeps incomplete and absent SQL pending', async () => {
  mock.inspect.mockResolvedValue({
    operation: { ...operation, phase: 'activation_attempted', version: 6 },
    account: null,
  });
  expect((await run()).status).toBe(202);
  mock.inspect.mockResolvedValue({ operation: null, account: null });
  expect((await run()).status).toBe(202);
});
it.each([
  { ...operation, revoked: true },
  { ...operation, phase: 'unknown' },
])(
  'reports stopped without provider mutation or observation',
  async (stopped) => {
    mock.inspect.mockResolvedValue({ operation: stopped, account: null });
    const response = await run();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'stopped',
      operationId,
    });
    expect(mock.identity).not.toHaveBeenCalled();
  }
);
it('does not confirm a provider ban or contradictory fresh SQL', async () => {
  mock.identity.mockResolvedValueOnce({
    data: { user: { ...provider, banned_until: '2999-01-01' } },
    error: null,
  });
  expect((await run()).status).toBe(202);
  mock.inspect
    .mockResolvedValueOnce({ operation, account })
    .mockResolvedValueOnce({
      operation,
      account: { ...account, email: 'other@tuturuuu.com' },
    });
  expect((await run()).status).toBe(202);
});
it.each([
  { authorized: false, status: 403 },
  { authorized: true, actorUserId: target },
])(
  'withholds results if authority changes before disclosure',
  async (changed) => {
    mock.current
      .mockResolvedValueOnce({ authorized: true, actorUserId: actor })
      .mockResolvedValueOnce(changed);
    const response = await run();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: 'employee_observation_denied',
    });
  }
);
it('retains default rejection GET rather than routing it through outcome observation', async () => {
  mock.rejection.mockResolvedValue({
    inspect: async () => ({
      status: 'fenced',
      operationId,
    }),
  });
  expect((await run(token(), operationId, undefined, '')).status).toBe(409);
  expect(mock.rejection).toHaveBeenCalledTimes(1);
  expect(mock.inspect).not.toHaveBeenCalled();
});
