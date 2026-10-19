// @vitest-environment node
import type {
  MigrationRecord,
  MigrationTransition,
} from '@tuturuuu/utils/internal-accounts/employee-address-migration-contract';
import { fingerprintEmployeeAddressMigrationIdentities } from '@tuturuuu/utils/internal-accounts/employee-address-migration-provider';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./employee-creation-authorization', () => ({
  authorizeEmployeeCreation: vi.fn(),
}));

import { createEmployeeAddressMigrationRequestHandlers } from './employee-address-migration-runtime';

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
const beforeState = 'a'.repeat(64);
const afterState = 'b'.repeat(64);
function request() {
  return new Request('https://infra.test/api/migration', {
    method: 'POST',
    headers: {
      origin: 'https://infra.test',
      'content-type': 'application/json',
      'x-tuturuuu-account-action': '1',
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify(tuple),
  });
}
async function fixture() {
  // Explicit transport/journal fixture. SQL ownership locks and GoTrue itself
  // are qualified separately; these observations drive the real Web protocol.
  const google = {
    identity_id: '10000000-0000-4000-8000-000000000005',
    id: 'google-subject',
    provider: 'google',
    user_id: userId,
    identity_data: {
      sub: 'google-subject',
      email: tuple.destinationAddress,
      email_verified: true,
    },
  };
  let identities = [google];
  let email = tuple.sourceAddress;
  let prepared = false;
  let record: MigrationRecord | null = null;
  let loseAck = false;
  let drift = false;
  let authorized = true;
  let discardReceipt = false;
  let failPreparation = false;
  let revision = 0;
  const beforeIdentity =
    await fingerprintEmployeeAddressMigrationIdentities(identities);
  const actions: string[] = [];
  const admin = {
    getUserById: vi.fn(async () => ({
      error: null,
      data: {
        user: {
          id: userId,
          email,
          email_confirmed_at: '2026-01-01T00:00:00Z',
          is_anonymous: false,
          identities,
        },
      },
    })),
    updateUserById: vi.fn(
      async (
        id: string,
        attributes: { email: string; email_confirm?: true }
      ) => {
        expect(id).toBe(userId);
        expect(attributes).toEqual({
          email: tuple.destinationAddress,
          email_confirm: true,
        });
        email = tuple.destinationAddress;
        identities = [
          google,
          {
            identity_id: '10000000-0000-4000-8000-000000000006',
            id: userId,
            provider: 'email',
            user_id: userId,
            identity_data: { sub: userId, email, email_verified: true },
          },
        ];
        if (loseAck) throw new Error('lost provider acknowledgement');
        return { error: null };
      }
    ),
  };
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const action = body.p_action;
    actions.push(action);
    expect(body.p_request).toMatchObject({ ...tuple, actorId });
    if (action === 'prepare') {
      if (record || failPreparation) return Response.json({}, { status: 409 });
      prepared = true;
      return Response.json({
        prepared: true,
        userId,
        destinationAddress: tuple.destinationAddress,
      });
    }
    const afterIdentity =
      await fingerprintEmployeeAddressMigrationIdentities(identities);
    const transition: MigrationTransition | undefined =
      record && email === tuple.destinationAddress
        ? {
            kind: 'google_destination',
            beforeImmutableFingerprint: beforeState,
            beforeProviderIdentityFingerprint: beforeIdentity,
            afterImmutableFingerprint: afterState,
            afterProviderIdentityFingerprint: afterIdentity,
          }
        : undefined;
    if (action === 'reserve')
      record = { binding: body.p_request, phase: 'reserved', attemptId: null };
    if (action === 'claim' && record) {
      record = { ...record, phase: 'attempted', attemptId: body.p_attempt_id };
      return Response.json(true);
    }
    if (action === 'complete' && record) {
      expect(body.p_request.providerIdentityFingerprint).toBe(beforeIdentity);
      record = {
        ...record,
        phase: 'completed',
        ...(discardReceipt ? {} : { transition }),
      };
      revision = 1;
    }
    return Response.json({
      authorized,
      revision,
      immutableFingerprint: transition ? afterState : beforeState,
      providerIdentityFingerprint: afterIdentity,
      sourceVerified: prepared && !drift,
      addressOwnership: prepared ? 'same_identity' : 'conflict',
      record,
      ...(transition ? { transition } : {}),
    });
  });
  const handlers = createEmployeeAddressMigrationRequestHandlers({
    authorize: async () =>
      authorized
        ? { authorized: true, actorUserId: actorId }
        : { authorized: false, status: 403 },
    configuration: () => ({ url: 'http://127.0.0.1:54321', key: 'fixture' }),
    admin: async () => admin,
    newAttemptId: () => attemptId,
    fetch: fetcher,
  });
  return {
    handlers,
    admin,
    actions,
    setLoseAck: () => {
      loseAck = true;
    },
    setDrift: () => {
      drift = true;
    },
    revoke: () => {
      authorized = false;
    },
    discardReceipt: () => {
      discardReceipt = true;
    },
    failPreparation: () => {
      failPreparation = true;
    },
  };
}
describe('verified Google destination and explicit mailbox preparation', () => {
  it('keeps an unowned inactive placeholder unavailable without attempting or preparing implicitly', async () => {
    const f = await fixture();
    expect(await (await f.handlers.inspect(request())).json()).toEqual({
      status: 'denied',
      code: 'not_ready',
    });
    expect((await f.handlers.migrate(request())).status).toBe(409);
    expect(f.actions).toEqual(['inspect', 'inspect']);
    expect(f.admin.getUserById).not.toHaveBeenCalled();
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('prepares explicitly, observes fresh readiness, preserves original binding and stores actual post fingerprints', async () => {
    const f = await fixture();
    expect(await (await f.handlers.prepare(request())).json()).toEqual({
      prepared: true,
      userId,
      destinationAddress: tuple.destinationAddress,
    });
    expect(f.actions).toEqual(['prepare', 'inspect']);
    expect(f.admin.getUserById).not.toHaveBeenCalled();
    expect((await f.handlers.inspect(request())).status).toBe(200);
    expect(await (await f.handlers.migrate(request())).json()).toEqual({
      status: 'completed',
      operationId,
      userId,
      email: tuple.destinationAddress,
    });
    expect((await f.handlers.inspect(request())).status).toBe(200);
    expect((await f.handlers.migrate(request())).status).toBe(200);
    expect(f.admin.updateUserById).toHaveBeenCalledExactlyOnceWith(userId, {
      email: tuple.destinationAddress,
      email_confirm: true,
    });
    expect((await f.handlers.prepare(request())).status).toBe(503);
  });
  it('retains a lost provider acknowledgement for inspection without another PUT', async () => {
    const f = await fixture();
    await f.handlers.prepare(request());
    f.setLoseAck();
    expect((await f.handlers.migrate(request())).status).toBe(202);
    expect((await f.handlers.inspect(request())).status).toBe(200);
    expect(f.admin.updateUserById).toHaveBeenCalledTimes(1);
  });
  it('does not publish completion without a durable matching post-transition receipt', async () => {
    const f = await fixture();
    await f.handlers.prepare(request());
    f.discardReceipt();
    expect((await f.handlers.migrate(request())).status).toBe(202);
    expect(f.admin.updateUserById).toHaveBeenCalledTimes(1);
  });
  it('denies fresh state drift after preparation without provider mutation', async () => {
    const f = await fixture();
    await f.handlers.prepare(request());
    f.setDrift();
    expect((await f.handlers.migrate(request())).status).toBe(409);
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('preserves preparation denial and origin/permission checks without provider work', async () => {
    const f = await fixture();
    f.failPreparation();
    expect((await f.handlers.prepare(request())).status).toBe(503);
    const foreign = request();
    foreign.headers.set('origin', 'https://foreign.test');
    expect((await f.handlers.prepare(foreign)).status).toBe(403);
    f.revoke();
    expect((await f.handlers.prepare(request())).status).toBe(403);
    expect(f.actions).toEqual(['prepare']);
    expect(f.admin.getUserById).not.toHaveBeenCalled();
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });
});
