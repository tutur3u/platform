// @vitest-environment node
import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { hasEmployeeRequestOrigin } from '@tuturuuu/utils/internal-accounts/employee-request-origin';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./employee-creation-authorization', () => ({
  authorizeEmployeeCreation: vi.fn(),
}));

import { createEmployeeAddressMigrationRequestHandlers } from './employee-address-migration-runtime';
import { makeEmployeeCreationBoundary } from './employee-creation-boundary';
import { employeeRequestOrigin } from './employee-request-origin';
import { createEmployeeRestorationRequestHandlers } from './employee-restoration-runtime';

const infra = 'https://infrastructure.tuturuuu.com';
const actor = '10000000-0000-4000-8000-000000000001';
function bearer(targetApp = 'infra') {
  return `Bearer ${createAppSessionToken({ userId: actor, targetApp }).token}`;
}
function request(headers: Record<string, string> = {}) {
  return new Request('https://tuturuuu.com/api/employee', {
    method: 'POST',
    headers: {
      origin: infra,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'x-tuturuuu-account-action': '1',
      authorization: bearer(),
      ...headers,
    },
    body: '{}',
  });
}
beforeEach(() =>
  vi.stubEnv(
    'TUTURUUU_APP_COORDINATION_SECRET',
    'origin-regression-disposable-secret'
  )
);
afterEach(() => vi.unstubAllEnvs());

it('accepts the configured satellite origin with a real signed infra bearer', () => {
  const req = request();
  expect(employeeRequestOrigin(req)).toBe(infra);
  expect(hasEmployeeRequestOrigin(req, employeeRequestOrigin(req))).toBe(true);
});
const rejectedHeaders: Record<string, string>[] = [
  { origin: 'https://foreign.test' },
  { origin: 'null' },
  { origin: `${infra}/` },
  { authorization: bearerInvalid() },
  { authorization: '' },
  { 'sec-fetch-site': 'cross-site' },
  {
    origin: 'https://foreign.test',
    'x-forwarded-host': 'infrastructure.tuturuuu.com',
    'x-forwarded-proto': 'https',
  },
];
it.each(rejectedHeaders)(
  'rejects foreign, malformed or spoofed browser requests: %j',
  (headers) => {
    const req = request(headers);
    expect(hasEmployeeRequestOrigin(req, employeeRequestOrigin(req))).toBe(
      false
    );
  }
);
function bearerInvalid() {
  return 'Bearer ttr_app_invalid';
}
it('rejects another app bearer and does not fall back to an infra cookie', () => {
  const req = request({
    authorization: bearer('web'),
    cookie: `tuturuuu_app_session=${bearer().slice(7)}`,
  });
  expect(employeeRequestOrigin(req)).toBe('https://tuturuuu.com');
});
it('preserves direct same-origin and non-browser CLI origin behavior', () => {
  const direct = request({
    origin: 'https://tuturuuu.com',
    authorization: 'Bearer cli-token',
  });
  expect(hasEmployeeRequestOrigin(direct, employeeRequestOrigin(direct))).toBe(
    true
  );
  direct.headers.delete('origin');
  direct.headers.delete('sec-fetch-site');
  expect(hasEmployeeRequestOrigin(direct, employeeRequestOrigin(direct))).toBe(
    true
  );
});

describe('all active employee adapters', () => {
  const authorize = async () =>
    ({ authorized: true, actorUserId: actor }) as const;
  it('CREATE passes the origin gate and rejects invalid body before journal mutation', async () => {
    const req = request({ 'idempotency-key': actor });
    expect(
      (await makeEmployeeCreationBoundary({ authorize })(req)).status
    ).toBe(400);
  });
  it('RESTORE passes the origin gate and rejects invalid body before provider mutation', async () => {
    const unused = vi.fn(async () => {
      throw new Error('unexpected mutation');
    });
    const handlers = createEmployeeRestorationRequestHandlers({
      authorize,
      enabled: () => true,
      configuration: () => ({ url: 'https://fixture.test', key: 'fixture' }),
      provider: async () => ({ getUserById: unused, updateUserById: unused }),
    });
    expect(
      (
        await handlers.restore(request(), {
          params: Promise.resolve({ userId: actor }),
        })
      ).status
    ).toBe(400);
    expect(unused).not.toHaveBeenCalled();
  });
  it('migration inspect/migrate pass the origin gate; missing-origin cookie requests stay denied', async () => {
    const unused = vi.fn(() => {
      throw new Error('unexpected dependency');
    });
    const handlers = createEmployeeAddressMigrationRequestHandlers({
      authorize,
      configuration: unused,
      admin: unused,
      newAttemptId: unused,
    });
    for (const handler of [handlers.inspect, handlers.migrate]) {
      expect((await handler(request())).status).toBe(400);
      const missing = request();
      missing.headers.delete('origin');
      missing.headers.delete('authorization');
      expect((await handler(missing)).status).toBe(403);
    }
    expect(unused).not.toHaveBeenCalled();
  });
});
