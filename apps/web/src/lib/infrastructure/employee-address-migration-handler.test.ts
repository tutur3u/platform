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
      'x-tuturuuu-account-action': '1',
      ...headers,
    },
    body: JSON.stringify({ ...body, ...extra }),
  });
}
describe('permission-authorized Web migration adapter', () => {
  it('denies missing root authority before configuration or provider access', async () => {
    const { deps, admin } = setup();
    const configuration = vi.fn(deps.configuration);
    const response = await createEmployeeAddressMigrationHandler({
      ...deps,
      configuration,
      authorize: async () => ({ authorized: false, status: 401 }),
    })(request(), 'migrate');
    expect(response.status).toBe(401);
    expect(configuration).not.toHaveBeenCalled();
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
    expect(response.status).toBe(409);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).p_action).toBe(
      'inspect'
    );
  });
  it('rejects malformed JSON and invalid migration tuples without dispatch', async () => {
    const { handler, fetcher } = setup();
    const malformed = new Request('https://web.example.test/migration', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://infra.example.test',
        'x-tuturuuu-account-action': '1',
      },
      body: '{',
    });
    expect((await handler(malformed, 'migrate')).status).toBe(400);
    const invalidUtf8 = new Request('https://web.example.test/migration', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://infra.example.test',
        'x-tuturuuu-account-action': '1',
      },
      body: new Uint8Array([0xff]),
    });
    expect((await handler(invalidUtf8, 'migrate')).status).toBe(400);
    expect(
      (
        await handler(
          request({ destinationAddress: 'different@tuturuuu.com' }),
          'migrate'
        )
      ).status
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects oversized payload without transport dispatch', async () => {
    const { handler, fetcher } = setup();
    expect(
      (await handler(request({ padding: 'x'.repeat(5000) }), 'migrate')).status
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['wrong-user', 'revoked-after-ack', 'revoked-after-readback'])(
    'withholds preparation acknowledgement for %s',
    async (mode) => {
      const { deps, fetcher, admin } = setup();
      let authorized = true;
      fetcher.mockImplementation(async (_url, init) => {
        const action = JSON.parse(String(init?.body)).p_action;
        if (action === 'prepare') {
          if (mode === 'revoked-after-ack') authorized = false;
          return Response.json({
            prepared: true,
            userId: mode === 'wrong-user' ? actorId : userId,
            destinationAddress: body.destinationAddress,
          });
        }
        authorized = false;
        return Response.json({
          authorized: true,
          revision: 0,
          immutableFingerprint: 'a'.repeat(64),
          providerIdentityFingerprint: 'b'.repeat(64),
          sourceVerified: true,
          addressOwnership: 'same_identity',
          record: null,
        });
      });
      const handler = createEmployeeAddressMigrationHandler({
        ...deps,
        authorize: async () =>
          authorized
            ? { authorized: true, actorUserId: actorId }
            : { authorized: false, status: 403 },
      });
      const response = await handler(request(), 'prepare');
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: 'forbidden' });
      expect(fetcher).toHaveBeenCalledTimes(
        mode === 'revoked-after-readback' ? 2 : 1
      );
      expect(admin).not.toHaveBeenCalled();
    }
  );
  it.each([
    { authorized: false },
    { revision: 1 },
    { sourceVerified: false },
    { addressOwnership: 'conflict' },
    {
      record: {
        binding: {
          ...body,
          actorId,
          immutableFingerprint: 'a'.repeat(64),
          providerIdentityFingerprint: 'b'.repeat(64),
        },
        phase: 'reserved',
        attemptId: null,
      },
    },
  ])('requires committed preparation readiness: %j', async (change) => {
    const { handler, fetcher, admin } = setup();
    fetcher
      .mockResolvedValueOnce(
        Response.json({
          prepared: true,
          userId,
          destinationAddress: body.destinationAddress,
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          authorized: true,
          revision: 0,
          immutableFingerprint: 'a'.repeat(64),
          providerIdentityFingerprint: 'b'.repeat(64),
          sourceVerified: true,
          addressOwnership: 'same_identity',
          record: null,
          ...change,
        })
      );
    const response = await handler(request(), 'prepare');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'unavailable' });
    expect(
      fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))
    ).toEqual([
      {
        p_action: 'prepare',
        p_request: { ...body, actorId },
        p_attempt_id: null,
      },
      {
        p_action: 'inspect',
        p_request: { ...body, actorId },
        p_attempt_id: null,
      },
    ]);
    expect(admin).not.toHaveBeenCalled();
  });
});

describe('explicit retained adoption adapter', () => {
  const snapshot = 'c'.repeat(64);
  const receipt = {
    status: 'adopted',
    operationId,
    userId,
    destinationAddress: body.destinationAddress,
    expectedRevision: 0,
    snapshot,
  };
  it('requires ownership confirmation and snapshot without changing empty prepare', async () => {
    const p = setup();
    for (const extra of [
      {},
      { snapshot },
      { snapshot, ownershipConfirmed: false },
      { snapshot: 'wrong', ownershipConfirmed: true },
    ]) {
      expect((await p.handler(request(extra), 'adopt-retained')).status).toBe(
        400
      );
    }
    expect(p.fetcher).not.toHaveBeenCalled();
    expect(
      (
        await p.handler(
          request({ snapshot, ownershipConfirmed: true }),
          'prepare'
        )
      ).status
    ).toBe(400);
  });
  it('binds the authenticated actor and routes only to the separate adoption RPC', async () => {
    const p = setup();
    p.fetcher.mockResolvedValueOnce(Response.json(receipt));
    const response = await p.handler(
      request({ snapshot, ownershipConfirmed: true }),
      'adopt-retained'
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(receipt);
    expect(String(p.fetcher.mock.calls[0]?.[0])).toContain(
      '/rpc/employee_retained_mailbox_adoption'
    );
    expect(JSON.parse(String(p.fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      p_action: 'adopt',
      p_request: { ...body, actorId },
      p_snapshot: snapshot,
      p_ownership_confirmed: true,
    });
    expect(p.admin).not.toHaveBeenCalled();
    expect(p.fetcher).toHaveBeenCalledTimes(1);
  });
  it('readback accepts only the original tuple and never calls a provider', async () => {
    const p = setup();
    p.fetcher.mockResolvedValueOnce(Response.json(receipt));
    expect((await p.handler(request(), 'retained-inspect')).status).toBe(200);
    expect(
      JSON.parse(String(p.fetcher.mock.calls[0]?.[1]?.body)).p_action
    ).toBe('inspect');
    expect(p.admin).not.toHaveBeenCalled();
    p.fetcher.mockResolvedValueOnce(
      Response.json({ ...receipt, operationId: userId })
    );
    expect((await p.handler(request(), 'retained-inspect')).status).toBe(503);
  });
  it('does not replay unknown adoption and fences fresh authorization revocation', async () => {
    const p = setup();
    p.fetcher.mockRejectedValueOnce(new Error('lost ack'));
    expect(
      (
        await p.handler(
          request({ snapshot, ownershipConfirmed: true }),
          'adopt-retained'
        )
      ).status
    ).toBe(503);
    expect(p.fetcher).toHaveBeenCalledTimes(1);
    const q = setup();
    q.fetcher.mockResolvedValueOnce(Response.json(receipt));
    let checks = 0;
    const handler = createEmployeeAddressMigrationHandler({
      ...q.deps,
      authorize: async () =>
        ++checks < 3
          ? { authorized: true, actorUserId: actorId }
          : { authorized: false, status: 403 },
    });
    expect(
      (
        await handler(
          request({ snapshot, ownershipConfirmed: true }),
          'adopt-retained'
        )
      ).status
    ).toBe(403);
    expect(q.admin).not.toHaveBeenCalled();
  });
});
