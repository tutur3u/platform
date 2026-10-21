// @vitest-environment node

import type { MigrationRecord } from '@tuturuuu/utils/internal-accounts/employee-address-migration-contract';
import { fingerprintEmployeeAddressMigrationIdentities } from '@tuturuuu/utils/internal-accounts/employee-address-migration-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./employee-creation-authorization', () => ({
  authorizeEmployeeCreation: vi.fn(),
}));

import { POST as adoptRetainedRoute } from '@/app/api/v1/infrastructure/internal-accounts/address-migrations/adopt-retained/route';
import { POST as inspectRoute } from '@/app/api/v1/infrastructure/internal-accounts/address-migrations/inspect/route';
import { POST as migrateRoute } from '@/app/api/v1/infrastructure/internal-accounts/address-migrations/migrate/route';
import { POST as prepareRoute } from '@/app/api/v1/infrastructure/internal-accounts/address-migrations/prepare/route';
import { POST as inspectRetainedRoute } from '@/app/api/v1/infrastructure/internal-accounts/address-migrations/retained-inspect/route';
import { createEmployeeAddressMigrationRequestHandlers } from './employee-address-migration-runtime';
import { authorizeEmployeeCreation } from './employee-creation-authorization';

vi.mock('next/server', () => ({ connection: vi.fn() }));

const actorId = '10000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';
const operationId = '10000000-0000-4000-8000-000000000003';
const attemptId = '10000000-0000-4000-8000-000000000004';
const tuple = {
  operationId,
  userId,
  expectedRevision: 0,
  sourceAddress: 'person@xwf.tuturuuu.com',
  destinationAddress: 'person@tuturuuu.com',
};
function request(
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) {
  return new Request('https://infra.test/api/migration', {
    method: 'POST',
    headers: {
      origin: 'https://infra.test',
      'content-type': 'application/json',
      'x-tuturuuu-account-action': '1',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    body: JSON.stringify({ ...tuple, ...extra }),
  });
}
async function fixture() {
  let record: MigrationRecord | null = null;
  let email = tuple.sourceAddress;
  let revision = 0;
  let authorized = true;
  let verified = true;
  let loseAcknowledgement = false;
  let loseClaim = false;
  let revokeAfterRead = false;
  const identities = [
    {
      identity_id: '10000000-0000-4000-8000-000000000005',
      provider: 'email',
      user_id: userId,
    },
  ];
  const fingerprint =
    await fingerprintEmployeeAddressMigrationIdentities(identities);
  const authorize = vi.fn(async () =>
    authorized
      ? { authorized: true as const, actorUserId: actorId }
      : { authorized: false as const, status: 403 as const }
  );
  const admin = {
    getUserById: vi.fn(async () => {
      if (revokeAfterRead) authorized = false;
      return {
        data: {
          user: {
            id: userId,
            email,
            email_confirmed_at: '2026-01-01T00:00:00Z',
            is_anonymous: false,
            identities: identities.map((identity) => ({
              ...identity,
              id: userId,
              identity_data: { email, email_verified: verified },
            })),
          },
        },
        error: null,
      };
    }),
    updateUserById: vi.fn(async (id: string, attributes: { email: string }) => {
      expect(id).toBe(userId);
      expect(attributes).toEqual({ email: tuple.destinationAddress });
      email = attributes.email;
      if (loseAcknowledgement) throw new Error('Lost provider acknowledgement');
      return { error: null };
    }),
  };
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body.p_request.actorId).toBe(actorId);
    if (body.p_action === 'reserve')
      record = { binding: body.p_request, phase: 'reserved', attemptId: null };
    if (body.p_action === 'claim' && record) {
      record = { ...record, phase: 'attempted', attemptId: body.p_attempt_id };
      if (loseClaim) throw new Error('Lost claim acknowledgement');
      return Response.json(true);
    }
    if (body.p_action === 'complete' && record) {
      record = { ...record, phase: 'completed' };
      revision = 1;
    }
    return Response.json({
      authorized,
      revision,
      immutableFingerprint: 'a'.repeat(64),
      providerIdentityFingerprint: fingerprint,
      sourceVerified: true,
      addressOwnership: 'same_identity',
      record,
    });
  });
  const deps = {
    authorize,
    admin: vi.fn(async () => admin),
    configuration: () => ({
      url: 'http://127.0.0.1:54321',
      key: 'disposable-key',
    }),
    newAttemptId: () => attemptId,
    fetch: fetcher,
  };
  return {
    deps,
    handlers: createEmployeeAddressMigrationRequestHandlers(deps),
    admin,
    fetcher,
    unverify: () => {
      verified = false;
    },
    loseAck: () => {
      loseAcknowledgement = true;
    },
    loseClaim: () => {
      loseClaim = true;
    },
    revokeOnRead: () => {
      revokeAfterRead = true;
    },
  };
}

afterEach(() => vi.unstubAllEnvs());
describe('address migration runtime binding', () => {
  it.each([
    inspectRoute,
    migrateRoute,
    prepareRoute,
    inspectRetainedRoute,
    adoptRetainedRoute,
  ])(
    'reaches authorization regardless of the retired optional env flag',
    async (route) => {
      for (const flag of [undefined, 'false']) {
        vi.stubEnv('EMPLOYEE_ADDRESS_MIGRATION_RUNTIME_ENABLED', flag);
        vi.mocked(authorizeEmployeeCreation).mockResolvedValue({
          authorized: false,
          status: 401,
        });
        const response = await route(request());
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ code: 'forbidden' });
        expect(response.headers.get('cache-control')).toContain('no-store');
      }
    }
  );
  it.each([undefined, 'false'])(
    'allows an authorized ready source with retired flag %s',
    async (flag) => {
      vi.stubEnv('EMPLOYEE_ADDRESS_MIGRATION_RUNTIME_ENABLED', flag);
      const f = await fixture();
      expect((await f.handlers.inspect(request())).status).toBe(200);
      expect(f.admin.updateUserById).not.toHaveBeenCalled();
    }
  );
  it('inspection qualifies the original revision without reserve or provider mutation', async () => {
    const f = await fixture();
    const response = await f.handlers.inspect(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready', ...tuple });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('requires matching verified active provider source even when SQL is ready', async () => {
    const f = await fixture();
    f.unverify();
    const response = await f.handlers.inspect(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      status: 'denied',
      code: 'not_ready',
    });
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('does not disclose readiness after actor retirement', async () => {
    const f = await fixture();
    f.revokeOnRead();
    expect((await f.handlers.inspect(request())).status).toBe(403);
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('performs one email-only change and independently reconciles the retained tuple', async () => {
    const f = await fixture();
    const response = await f.handlers.migrate(request());
    expect(response.status).toBe(200);
    const completed = {
      status: 'completed',
      operationId,
      userId,
      email: tuple.destinationAddress,
    };
    expect(await response.json()).toEqual(completed);
    expect(await (await f.handlers.inspect(request())).json()).toEqual(
      completed
    );
    expect(await (await f.handlers.migrate(request())).json()).toEqual(
      completed
    );
    expect(f.admin.updateUserById).toHaveBeenCalledExactlyOnceWith(userId, {
      email: tuple.destinationAddress,
    });
  });
  it('retains a lost provider acknowledgement and reconciles without a second PUT', async () => {
    const f = await fixture();
    f.loseAck();
    expect(await (await f.handlers.migrate(request())).json()).toEqual({
      status: 'pending',
      operationId,
      nextAction: 'inspect',
    });
    expect(await (await f.handlers.inspect(request())).json()).toMatchObject({
      status: 'completed',
      operationId,
      userId,
    });
    expect(f.admin.updateUserById).toHaveBeenCalledTimes(1);
  });
  it('never uses persisted attempt state to replay a lost claim', async () => {
    const f = await fixture();
    f.loseClaim();
    expect((await f.handlers.migrate(request())).status).toBe(202);
    expect((await f.handlers.inspect(request())).status).toBe(202);
    expect((await f.handlers.migrate(request())).status).toBe(202);
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    { 'x-tuturuuu-account-action': '0' },
    { 'sec-fetch-site': 'cross-site' },
    { origin: 'https://foreign.test' },
    { 'content-type': 'application/jsonp' },
  ])(
    'rejects browser boundary violations before suppliers: %j',
    async (headers) => {
      const f = await fixture();
      expect((await f.handlers.inspect(request({}, headers))).ok).toBe(false);
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(f.deps.admin).not.toHaveBeenCalled();
    }
  );
  it('rejects actor injection and non-XWF sources without suppliers', async () => {
    const f = await fixture();
    expect((await f.handlers.migrate(request({ actorId }))).status).toBe(400);
    expect(
      (
        await f.handlers.inspect(
          request({ sourceAddress: 'person@other.tuturuuu.com' })
        )
      ).status
    ).toBe(400);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});
