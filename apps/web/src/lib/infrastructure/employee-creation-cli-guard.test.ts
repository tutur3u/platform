import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimitRedis: mock.limit }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import { guardEmployeeCreationCli } from './employee-creation-cli-guard';

const actor = '10000000-0000-4000-8000-000000000001';
const operationId = '0da9bb8d-fd22-433b-97a0-d54a0cecf5b3';
const secret = 'synthetic-employee-guard-secret';
const password = 'Synthetic-SECRET-Pass-123!';
const cliToken = () =>
  createCliAppSession(
    {
      userId: actor,
      email: 'admin@tuturuuu.com',
      mfa: { sessionId: 'synthetic', verifiedAt: 1 },
    },
    { secret }
  ).access.token;
const post = (token?: string) =>
  new Request('https://web.test/employees', {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      'Idempotency-Key': operationId,
    },
    body: JSON.stringify({
      email: 'QA-Operator@tuturuuu.com',
      displayName: 'QA Operator',
      temporaryPassword: password,
    }),
  });
const created = () =>
  Response.json({ status: 'created', operationId }, { status: 201 });

let info: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', secret);
  vi.stubEnv('EMPLOYEE_CREATION_CLI_ENABLED', 'true');
  mock.limit.mockResolvedValue({
    allowed: true,
    limit: 5,
    remaining: 4,
    reset: Math.floor(Date.now() / 1000) + 3600,
  });
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  info.mockRestore();
  warn.mockRestore();
});

const logged = () => JSON.stringify([...info.mock.calls, ...warn.mock.calls]);

it('passes non-CLI credentials and flag-off CLI tokens through without quota or audit', async () => {
  const handle = vi.fn(async () => created());
  await guardEmployeeCreationCli(post(), handle);
  const infra = createAppSessionToken(
    {
      userId: actor,
      email: 'admin@tuturuuu.com',
      targetApp: 'infra',
      originApp: 'web',
      scopes: [],
    },
    { secret }
  ).token;
  await guardEmployeeCreationCli(post(infra), handle);
  vi.stubEnv('EMPLOYEE_CREATION_CLI_ENABLED', 'false');
  await guardEmployeeCreationCli(post(cliToken()), handle);
  expect(handle).toHaveBeenCalledTimes(3);
  expect(mock.limit).not.toHaveBeenCalled();
  expect(info).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
});

it('rate limits CLI creates per actor at 5 per hour, failing closed', async () => {
  const handle = vi.fn(async () => created());
  const token = cliToken();
  const response = await guardEmployeeCreationCli(post(token), handle);
  expect(response.status).toBe(201);
  expect(mock.limit).toHaveBeenCalledWith(
    `employee-creation:cli:${actor}`,
    { windowMs: 3_600_000, maxRequests: 5 },
    { failClosed: true }
  );
  mock.limit.mockResolvedValueOnce({
    allowed: false,
    limit: 5,
    remaining: 0,
    reset: Math.floor(Date.now() / 1000) + 600,
  });
  const limited = await guardEmployeeCreationCli(post(token), handle);
  expect(limited.status).toBe(429);
  expect(await limited.json()).toEqual({
    code: 'employee_creation_rate_limited',
  });
  expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  mock.limit.mockResolvedValueOnce({
    allowed: false,
    unavailable: true,
    limit: 5,
    remaining: 0,
    reset: Math.floor(Date.now() / 1000) + 3600,
  });
  expect((await guardEmployeeCreationCli(post(token), handle)).status).toBe(
    503
  );
  expect(handle).toHaveBeenCalledOnce();
});

it('audits every CLI attempt with ids only, never the token or password', async () => {
  const token = cliToken();
  await guardEmployeeCreationCli(post(token), async () => created());
  expect(info).toHaveBeenCalledWith('[employee-creation-cli]', {
    event: 'employee_creation_cli',
    actorUserId: actor,
    tokenId: expect.any(String),
    targetEmail: 'qa-operator@tuturuuu.com',
    operationId,
    httpStatus: 201,
    result: 'created',
  });
  await guardEmployeeCreationCli(post(token), async () =>
    Response.json({ code: 'forbidden' }, { status: 403 })
  );
  expect(warn).toHaveBeenCalledWith(
    '[employee-creation-cli]',
    expect.objectContaining({ httpStatus: 403, result: 'forbidden' })
  );
  expect(logged()).not.toContain(password);
  expect(logged()).not.toContain(token);
});

it('hands the request body to the handler intact', async () => {
  const handle = vi.fn(async (request: Request) => {
    expect(await request.json()).toMatchObject({ temporaryPassword: password });
    return created();
  });
  await guardEmployeeCreationCli(post(cliToken()), handle);
  expect(handle).toHaveBeenCalledOnce();
});

it('fails closed with 503 when the quota backend throws', async () => {
  mock.limit.mockRejectedValueOnce(new Error('redis down'));
  const handle = vi.fn(async () => created());
  const response = await guardEmployeeCreationCli(post(cliToken()), handle);
  expect(response.status).toBe(503);
  expect(handle).not.toHaveBeenCalled();
});

it('audits null for a malformed operation id and for an unloggable or non-JSON target', async () => {
  const token = cliToken();
  const request = (body: string, key: string) =>
    new Request('https://web.test/employees', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body,
    });
  await guardEmployeeCreationCli(request('not json', 'not-a-uuid'), async () =>
    created()
  );
  await guardEmployeeCreationCli(
    request(JSON.stringify({ email: 'a\nb@tuturuuu.com' }), operationId),
    async () => created()
  );
  expect(info).toHaveBeenNthCalledWith(
    1,
    '[employee-creation-cli]',
    expect.objectContaining({ targetEmail: null, operationId: null })
  );
  expect(info).toHaveBeenNthCalledWith(
    2,
    '[employee-creation-cli]',
    expect.objectContaining({ targetEmail: null, operationId })
  );
});
