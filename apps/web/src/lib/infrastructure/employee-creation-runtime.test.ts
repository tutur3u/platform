import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  configuration: vi.fn(),
  admin: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: mock.configuration,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mock.admin,
}));
vi.mock('./employee-creation-authorization', () => ({
  authorizeEmployeeCreation: mock.authorize,
}));

import {
  GET,
  POST,
} from '../../app/api/v1/infrastructure/internal-accounts/employees/route';
import { createEmployeeRuntimeJournal } from './employee-creation-runtime';

const actor = '10000000-0000-4000-8000-000000000001';
const transport = vi.fn<typeof fetch>();
const identity = vi.fn();
const request = () => new Request('https://web.test/employees');
const post = () =>
  new Request('https://web.test/employees', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tuturuuu-account-action': '1',
      'Idempotency-Key': '10000000-0000-4000-8000-000000000002',
    },
    body: JSON.stringify({
      email: 'staff@tuturuuu.com',
      displayName: 'Staff',
      temporaryPassword: 'temporary-pass-123',
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mock.configuration.mockReturnValue({
    url: 'https://synthetic.supabase.co',
    key: 'synthetic',
  });
  mock.authorize.mockResolvedValue({ authorized: true, actorUserId: actor });
  identity.mockResolvedValue({
    data: {
      user: {
        id: actor,
        email: 'admin@tuturuuu.com',
        email_confirmed_at: '2026-01-01',
      },
    },
    error: null,
  });
  mock.admin.mockResolvedValue({ auth: { admin: { getUserById: identity } } });
  transport.mockImplementation(async () =>
    Response.json({
      ready: true,
      contract: 'employee-http-rpc-v1',
      finalizeSha256: 'a'.repeat(64),
      confirmSha256: 'b'.repeat(64),
    })
  );
  vi.stubGlobal('fetch', transport);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([undefined, 'false'])(
  'composes an eligible production journal with activation flag %s',
  async (flag) => {
    vi.stubEnv('EMPLOYEE_CREATION_RUNTIME_ENABLED', flag);
    const journal = await createEmployeeRuntimeJournal(request());
    expect(journal).toBeDefined();
    expect(await journal?.available(actor)).toBe(true);
    expect(mock.configuration).toHaveBeenCalledWith({ useSecretKey: true });
    expect(mock.admin).toHaveBeenCalledWith({ noCookie: true });
    expect(identity).toHaveBeenCalledExactlyOnceWith(actor);
    expect(transport).toHaveBeenCalledTimes(2);
    for (const [url, init] of transport.mock.calls) {
      expect(String(url)).toBe(
        'https://synthetic.supabase.co/rest/v1/rpc/employee_creation_runtime_ready'
      );
      expect(JSON.parse(String(init?.body))).toEqual({ p_actor_id: actor });
    }
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
  }
);
it.each([undefined, 'false'])(
  'keeps nonadmins denied with flag %s',
  async (flag) => {
    vi.stubEnv('EMPLOYEE_CREATION_RUNTIME_ENABLED', flag);
    mock.authorize.mockResolvedValue({ authorized: false, status: 403 });
    const journal = await createEmployeeRuntimeJournal(request());
    expect(journal).toBeDefined();
    expect(await journal?.available(actor)).toBe(false);
    for (const response of [await GET(request()), await POST(post())]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: 'forbidden' });
    }
    expect(identity).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  }
);
it('keeps failed server configuration unavailable for factory, GET and POST', async () => {
  mock.configuration.mockImplementation(() => {
    throw Error('synthetic configuration unavailable');
  });
  expect(await createEmployeeRuntimeJournal(request())).toBeUndefined();
  expect(await (await GET(request())).json()).toEqual({ available: false });
  const response = await POST(post());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    code: 'employee_creation_unavailable',
  });
  expect(mock.admin).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});
it('keeps unavailable SQL readiness unavailable after composition', async () => {
  transport.mockImplementation(async () => Response.json({ ready: false }));
  expect(await (await GET(request())).json()).toEqual({ available: false });
  expect((await POST(post())).status).toBe(503);
  expect(transport).toHaveBeenCalledTimes(2);
});
