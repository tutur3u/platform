import { describe, expect, it, vi } from 'vitest';
import { makeEmployeeCreationBoundary } from './employee-creation-boundary';

const operationId = '0da9bb8d-fd22-433b-97a0-d54a0cecf5b3';
const userId = 'e0dfe613-9e8a-4fa4-8f52-fd881aa2e9f2';
const payload = {
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  temporaryPassword: 'temporary-pass-123',
};
const request = (
  body: unknown = payload,
  changes: Record<string, string> = {}
) =>
  new Request(
    'https://web.test/api/v1/infrastructure/internal-accounts/employees',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tuturuuu-account-action': '1',
        'Idempotency-Key': operationId,
        ...changes,
      },
      body: JSON.stringify(body),
    }
  );
const authorize = async () =>
  ({ authorized: true, actorUserId: userId }) as const;
describe('employee source boundary', () => {
  it('reports unavailable and refuses creation with no installed journal', async () => {
    const handler = makeEmployeeCreationBoundary({ authorize });
    const get = await handler(new Request('https://web.test/employees'));
    expect(await get.json()).toEqual({ available: false });
    const post = await handler(request());
    expect(post.status).toBe(503);
    expect(await post.json()).toEqual({
      code: 'employee_creation_unavailable',
    });
    expect(post.headers.get('cache-control')).toContain('no-store');
  });
  it.each([401, 403, 503] as const)(
    'preserves fresh authorization denial %s before a journal',
    async (status) => {
      const claimAndRun = vi.fn();
      const handler = makeEmployeeCreationBoundary({
        authorize: async () => ({ authorized: false, status }),
        journal: { available: async () => true, claimAndRun },
      });
      expect((await handler(request())).status).toBe(status);
      expect(claimAndRun).not.toHaveBeenCalled();
    }
  );
  it.each([
    [{ ...payload, actorUserId: 'spoof' }, {}, 400],
    [{ ...payload, email: 'staff@sub.tuturuuu.com' }, {}, 400],
    [payload, { origin: 'https://foreign.test' }, 403],
    [payload, { 'sec-fetch-site': 'cross-site' }, 403],
    [payload, { 'Idempotency-Key': 'not-an-operation' }, 400],
    [payload, { 'x-tuturuuu-account-action': '0' }, 403],
  ])(
    'refuses invalid request without admission',
    async (body, headers, status) => {
      const claimAndRun = vi.fn();
      const handler = makeEmployeeCreationBoundary({
        authorize,
        journal: { available: async () => true, claimAndRun },
      });
      expect((await handler(request(body, headers))).status).toBe(status);
      expect(claimAndRun).not.toHaveBeenCalled();
    }
  );
  it('binds server actor, normalized payload and unchanged operation key', async () => {
    const value = {
      status: 'created',
      operationId,
      account: {
        id: userId,
        email: payload.email,
        displayName: payload.displayName,
      },
    };
    const claimAndRun = vi
      .fn()
      .mockResolvedValue({ targetUserId: userId, outcome: value });
    const handler = makeEmployeeCreationBoundary({
      authorize,
      journal: { available: async () => true, claimAndRun },
    });
    const response = await handler(
      request({
        ...payload,
        email: ' Staff@TUTURUUU.COM ',
        displayName: ' Staff ',
      })
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(value);
    expect(claimAndRun).toHaveBeenCalledExactlyOnceWith({
      actorUserId: userId,
      operationId,
      payload,
    });
  });
  it.each([
    'throw',
    'wrong-UUID',
    'wrong-target-UUID',
    'wrong-tuple',
    'extra-password',
  ])('keeps uncertain acknowledgement inspect-only: %s', async (variant) => {
    const claimAndRun = vi.fn(async () => {
      if (variant === 'throw') throw new Error('private-provider-diagnostic');
      return {
        targetUserId: variant === 'wrong-target-UUID' ? operationId : userId,
        outcome: {
          status: 'created',
          operationId: variant === 'wrong-UUID' ? userId : operationId,
          account: {
            id: userId,
            email:
              variant === 'wrong-tuple' ? 'other@tuturuuu.com' : payload.email,
            displayName: 'Staff',
            ...(variant === 'extra-password' ? { password: 'private' } : {}),
          },
        },
      };
    });
    const handler = makeEmployeeCreationBoundary({
      authorize,
      journal: { available: async () => true, claimAndRun },
    });
    const response = await handler(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      status: 'pending',
      operationId,
      code: 'account_creation_outcome_unknown',
      nextAction: 'inspect',
    });
    expect(claimAndRun).toHaveBeenCalledTimes(1);
  });
  it('preserves journal collision and known pending instead of inventing a second invocation', async () => {
    for (const result of [
      {
        status: 'conflict',
        operationId,
        code: 'employee_operation_payload_conflict',
        nextAction: 'inspect',
      },
      {
        status: 'pending',
        operationId,
        code: 'employee_provisioning_pending',
        nextAction: 'inspect',
      },
    ]) {
      const claimAndRun = vi
        .fn()
        .mockResolvedValue({ targetUserId: userId, outcome: result });
      const handler = makeEmployeeCreationBoundary({
        authorize,
        journal: { available: async () => true, claimAndRun },
      });
      const response = await handler(request());
      expect(response.status).toBe(result.status === 'conflict' ? 409 : 202);
      expect(await response.json()).toEqual(result);
      expect(claimAndRun).toHaveBeenCalledTimes(1);
    }
  });
});
