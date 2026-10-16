// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createEmployeeAddressMigrationHandler } from './employee-address-migration-handler';

const actorId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const operationId = '00000000-0000-4000-8000-000000000003';
const body = {
  userId,
  operationId,
  expectedRevision: 0,
  sourceAddress: 'person@xwf.tuturuuu.com',
  destinationAddress: 'person@tuturuuu.com',
};
function setup() {
  const authorize = vi.fn(async () => ({
    authorized: true as const,
    actorUserId: actorId,
  }));
  const admin = vi.fn(async () => ({
    getUserById: vi.fn(),
    updateUserById: vi.fn(),
  }));
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      authorized: true,
      revision: 0,
      immutableFingerprint: 'a'.repeat(64),
      providerIdentityFingerprint: 'b'.repeat(64),
      sourceVerified: false,
      addressOwnership: 'same_identity',
      record: null,
    })
  );
  const deps = {
    authorize,
    admin,
    enabled: () => true,
    trustedOrigin: 'https://infra.example.test',
    configuration: () => ({
      url: 'http://127.0.0.1:54321',
      key: 'disposable-key',
    }),
    newAttemptId: () => operationId,
    fetch: fetcher,
  };
  return {
    deps,
    handler: createEmployeeAddressMigrationHandler(deps),
    authorize,
    admin,
    fetcher,
  };
}
function request(
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) {
  return new Request('https://web.example.test/migration', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://infra.example.test',
      ...headers,
    },
    body: JSON.stringify({ ...body, ...extra }),
  });
}
describe('inactive Web migration adapter', () => {
  it('does nothing when disabled', async () => {
    const { deps, authorize, admin } = setup();
    const response = await createEmployeeAddressMigrationHandler({
      ...deps,
      enabled: () => false,
    })(request(), 'migrate');
    expect(response.status).toBe(503);
    expect(authorize).not.toHaveBeenCalled();
    expect(admin).not.toHaveBeenCalled();
  });
  it('rejects browser cross-origin and missing-origin cookie requests', async () => {
    const { handler, authorize } = setup();
    expect(
      (
        await handler(
          request({}, { origin: 'https://foreign.test' }),
          'migrate'
        )
      ).status
    ).toBe(403);
    const noOrigin = request();
    noOrigin.headers.delete('origin');
    expect((await handler(noOrigin, 'migrate')).status).toBe(403);
    expect(authorize).not.toHaveBeenCalled();
  });
  it('does not accept actor identity from the body', async () => {
    const { handler, fetcher } = setup();
    expect(
      (await handler(request({ actorId: userId }), 'migrate')).status
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('binds the actor to fresh authorization and returns not_ready with no provider calls', async () => {
    const { handler, fetcher, admin } = setup();
    const response = await handler(request(), 'migrate');
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      status: 'denied',
      code: 'not_ready',
    });
    expect(
      JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).p_request.actorId
    ).toBe(actorId);
    expect(
      (await admin.mock.results[0]?.value)?.updateUserById
    ).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('allows valid bearer requests without browser origin and only inspects retained operations', async () => {
    const { handler, fetcher } = setup();
    const req = request({}, { authorization: 'Bearer ttr_app_disposable' });
    req.headers.delete('origin');
    const response = await handler(req, 'inspect');
    expect(response.status).toBe(202);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).p_action).toBe(
      'inspect'
    );
  });
  it('rejects oversized payload without transport dispatch', async () => {
    const { handler, fetcher } = setup();
    expect(
      (await handler(request({ padding: 'x'.repeat(5000) }), 'migrate')).status
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
