import { expect, it, vi } from 'vitest';
import { observeEmployeeCliRecoveryOutcome } from './employee-cli-outcome';

const operationId = '10000000-0000-4000-8000-000000000001';
const targetUserId = '10000000-0000-4000-8000-000000000002';
const identity = {
  operationId,
  targetUserId,
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
};
const created = {
  status: 'created',
  operationId,
  account: {
    id: targetUserId,
    email: identity.email,
    displayName: identity.displayName,
  },
};
const pending = {
  status: 'pending',
  operationId,
  code: 'account_creation_outcome_unknown',
  nextAction: 'inspect',
};
const stopped = {
  status: 'stopped',
  operationId,
  code: 'employee_operation_halted',
};
const conflict = {
  status: 'conflict',
  operationId,
  code: 'employee_account_conflict',
  nextAction: 'inspect',
};
it.each([
  200, 201, 202, 203, 204, 206, 207, 299, 400, 401, 403, 404, 409, 422, 500,
  503,
])(
  'enforces the outcome-only HTTP matrix at %s with one dispatch',
  async (status) => {
    for (const body of [created, pending, stopped, conflict]) {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        status === 204
          ? new Response(null, { status })
          : Response.json(body, { status })
      );
      const result = observeEmployeeCliRecoveryOutcome(identity, { fetch });
      if (
        (body === pending && status === 202) ||
        ((body === created || body === stopped) && status === 200)
      )
        await expect(result).resolves.toEqual(body);
      else await expect(result).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  }
);
it('sends the same credential and original key only to the read-only outcome view', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(created)
  );
  const signal = new AbortController().signal;
  await observeEmployeeCliRecoveryOutcome(identity, {
    fetch,
    signal,
    defaultHeaders: { authorization: 'Bearer synthetic' },
  });
  const [url, init] = fetch.mock.calls[0]!;
  expect(String(url)).toContain(
    `/operations/${operationId}/cli-recovery?view=outcome`
  );
  expect(init).toMatchObject({
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
    signal,
  });
  expect(init?.body).toBeUndefined();
  const headers = new Headers(init?.headers);
  expect(headers.get('authorization')).toBe('Bearer synthetic');
  expect(headers.get('idempotency-key')).toBe(operationId);
  expect(headers.has('x-tuturuuu-account-action')).toBe(false);
});
it.each([
  { ...created, operationId: targetUserId },
  { ...created, account: { ...created.account, id: operationId } },
  { ...created, account: { ...created.account, email: 'other@tuturuuu.com' } },
  { ...created, account: { ...created.account, displayName: 'Other' } },
])(
  'rejects mismatched identity at the valid created HTTP status',
  async (body) => {
    const fetch = vi.fn(async () => Response.json(body, { status: 200 }));
    await expect(
      observeEmployeeCliRecoveryOutcome(identity, { fetch })
    ).rejects.toThrow('inspection');
    expect(fetch).toHaveBeenCalledTimes(1);
  }
);
it('does not replay a lost observation response', async () => {
  const fetch = vi.fn(async () => {
    throw new Error('lost');
  });
  await expect(
    observeEmployeeCliRecoveryOutcome(identity, { fetch })
  ).rejects.toThrow('lost');
  expect(fetch).toHaveBeenCalledTimes(1);
});
