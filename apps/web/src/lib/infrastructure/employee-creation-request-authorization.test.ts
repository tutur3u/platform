import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  cli: vi.fn(),
  infra: vi.fn(),
  bind: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
}));
vi.mock('@tuturuuu/utils/required-mfa-lineage', () => ({
  bindCurrentMfaFactor: mock.bind,
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimitRedis: vi.fn() }));
vi.mock('./employee-cli-recovery-authorization', () => ({
  authorizeEmployeeCliRecovery: mock.cli,
}));
vi.mock('./employee-creation-authorization', () => ({
  authorizeEmployeeCreation: mock.infra,
}));

import { makeEmployeeCreationBoundary } from './employee-creation-boundary';
import { authorizeEmployeeCreationRequest } from './employee-creation-request-authorization';

const actor = '10000000-0000-4000-8000-000000000001';
const secret = 'synthetic-employee-admission-secret';
const now = Math.floor(Date.now() / 1000);
const proof = { sessionId: 'synthetic-session', verifiedAt: now - 60 };
const claims = { userId: actor, email: 'admin@tuturuuu.com', mfa: proof };
const noMfa = { userId: actor, email: 'admin@tuturuuu.com' };
const request = (token?: string) =>
  new Request('https://web.test/employees', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', secret);
  vi.stubEnv('EMPLOYEE_CREATION_CLI_ENABLED', 'true');
  mock.bind.mockImplementation(async (_admin, _user, value) => ({
    ...value,
    factorId: 'factor',
  }));
  mock.cli.mockResolvedValue({ authorized: true, actorUserId: actor });
  mock.infra.mockResolvedValue({ authorized: false, status: 401 });
});
afterEach(() => vi.unstubAllEnvs());

it('routes a verified CLI access token through the CLI employee authorization', async () => {
  const req = request(createCliAppSession(claims, { secret }).access.token);
  expect(await authorizeEmployeeCreationRequest(req)).toEqual({
    authorized: true,
    actorUserId: actor,
  });
  expect(mock.cli).toHaveBeenCalledWith(req);
  expect(mock.infra).not.toHaveBeenCalled();
  expect(mock.bind).toHaveBeenCalledWith({}, actor, proof, true);
});

it('keeps CLI tokens on the infra path unless the flag is exactly "true"', async () => {
  const token = createCliAppSession(claims, { secret }).access.token;
  for (const value of [undefined, '', 'TRUE', '1', 'yes', 'true ']) {
    if (value === undefined) vi.stubEnv('EMPLOYEE_CREATION_CLI_ENABLED', '');
    else vi.stubEnv('EMPLOYEE_CREATION_CLI_ENABLED', value);
    mock.infra.mockClear();
    const req = request(token);
    expect(await authorizeEmployeeCreationRequest(req)).toEqual({
      authorized: false,
      status: 401,
    });
    expect(mock.infra).toHaveBeenCalledWith(req);
  }
  expect(mock.cli).not.toHaveBeenCalled();
  expect(mock.bind).not.toHaveBeenCalled();
});

it('always requires a bound MFA proof, even when the operator has no MFA policy', async () => {
  // The CLI recovery check (which applies the policy) would admit this actor.
  const cases: Array<[Record<string, unknown>, number]> = [
    [noMfa, 403],
    [{ ...noMfa, mfa: { ...proof, verifiedAt: now + 3600 } }, 403],
    [{ ...noMfa, mfa: { ...proof, expiresAt: now - 1 } }, 403],
  ];
  for (const [value, status] of cases) {
    const token = createCliAppSession(value as typeof claims, { secret }).access
      .token;
    expect(await authorizeEmployeeCreationRequest(request(token))).toEqual({
      authorized: false,
      status,
    });
  }
  expect(mock.bind).not.toHaveBeenCalled();
  const token = createCliAppSession(claims, { secret }).access.token;
  mock.bind.mockResolvedValueOnce(null);
  expect(await authorizeEmployeeCreationRequest(request(token))).toEqual({
    authorized: false,
    status: 403,
  });
  mock.bind.mockRejectedValueOnce(new Error('unavailable'));
  expect(await authorizeEmployeeCreationRequest(request(token))).toEqual({
    authorized: false,
    status: 503,
  });
  expect(mock.cli).not.toHaveBeenCalled();
  expect(mock.infra).not.toHaveBeenCalled();
});

it('propagates a CLI authorization denial without falling back to another path', async () => {
  mock.cli.mockResolvedValue({ authorized: false, status: 403 });
  const req = request(createCliAppSession(claims, { secret }).access.token);
  expect(await authorizeEmployeeCreationRequest(req)).toEqual({
    authorized: false,
    status: 403,
  });
  expect(mock.infra).not.toHaveBeenCalled();
});

it('keeps every non-CLI credential on the unchanged infra/admin path', async () => {
  const session = createCliAppSession(claims, { secret });
  const app = (targetApp: string, scopes: string[], originApp = 'cli') =>
    createAppSessionToken(
      { ...claims, targetApp, originApp, scopes },
      { secret }
    ).token;
  for (const token of [
    undefined,
    session.refresh.token,
    app('infra', ['cli:access']),
    app('platform', ['cli:access'], 'infra'),
    createCliAppSession(claims, { secret: 'wrong-secret' }).access.token,
    createCliAppSession(claims, { secret, now: new Date('2000-01-01') }).access
      .token,
    `${session.access.token}corrupt`,
    'supabase-jwt-shaped-token',
  ]) {
    mock.infra.mockClear();
    const req = request(token);
    expect(await authorizeEmployeeCreationRequest(req)).toEqual({
      authorized: false,
      status: 401,
    });
    expect(mock.infra).toHaveBeenCalledWith(req);
  }
  expect(mock.cli).not.toHaveBeenCalled();
});

it('keeps the origin, action-header and content-type gates for a CLI bearer', async () => {
  const token = createCliAppSession(claims, { secret }).access.token;
  const operationId = '0da9bb8d-fd22-433b-97a0-d54a0cecf5b3';
  const claimAndRun = vi.fn(async () => ({
    targetUserId: '20000000-0000-4000-8000-000000000002',
    outcome: {
      status: 'created',
      operationId,
      account: {
        id: '20000000-0000-4000-8000-000000000002',
        email: 'qa-operator@tuturuuu.com',
        displayName: 'QA Operator',
      },
    },
  }));
  const boundary = makeEmployeeCreationBoundary({
    authorize: authorizeEmployeeCreationRequest,
    journal: { available: async () => true, claimAndRun },
  });
  const post = (headers: Record<string, string>) =>
    boundary(
      new Request('https://web.test/employees', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-tuturuuu-account-action': '1',
          'Idempotency-Key': operationId,
          ...headers,
        },
        body: JSON.stringify({
          email: 'qa-operator@tuturuuu.com',
          displayName: 'QA Operator',
          temporaryPassword: 'Synthetic-Pass-123!',
        }),
      })
    );
  expect((await post({ Origin: 'https://evil.example' })).status).toBe(403);
  expect((await post({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
  expect((await post({ 'x-tuturuuu-account-action': '0' })).status).toBe(403);
  expect((await post({ 'Content-Type': 'text/plain' })).status).toBe(415);
  expect(claimAndRun).not.toHaveBeenCalled();
  expect((await post({})).status).toBe(201);
  expect(claimAndRun).toHaveBeenCalledOnce();
  expect(claimAndRun).toHaveBeenCalledWith(
    expect.objectContaining({ actorUserId: actor, operationId })
  );
});

it('answers 503 when token verification is unavailable', async () => {
  const token = createCliAppSession(claims, { secret }).access.token;
  vi.stubEnv('NODE_ENV', 'production');
  // Blank every name the coordination-secret resolver reads: CI sets a
  // SUPABASE_SECRET_KEY placeholder, which is a deliberate fallback.
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', '');
  vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', '');
  vi.stubEnv('APP_COORDINATION_TOKEN_NEXT_SECRET', '');
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
  expect(await authorizeEmployeeCreationRequest(request(token))).toEqual({
    authorized: false,
    status: 503,
  });
  expect(mock.cli).not.toHaveBeenCalled();
  expect(mock.infra).not.toHaveBeenCalled();
});
