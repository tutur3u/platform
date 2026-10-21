import { expect, it, vi } from 'vitest';
import {
  inspectEmployeeCliRecovery,
  submitEmployeeCliRecovery,
} from './employee-cli-recovery';

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ready = {
  status: 'retry_ready' as const,
  actorUserId: id(1),
  operationId: id(2),
  targetUserId: id(3),
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  originalLeaseId: id(4),
  originalAttemptEventId: id(5),
  expectedVersion: 3 as const,
  eventId: id(6),
  evidenceReferenceSha256: 'a'.repeat(64),
};
const resume = {
  action: 'resume' as const,
  expected: ready,
  temporaryPassword: 'Synthetic-Pass-123!',
};
it('uses the operation-only endpoint, binds the key, and keeps inspection read-only', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(ready)
  );
  expect(await inspectEmployeeCliRecovery(id(2), { fetch })).toEqual(ready);
  expect(String(fetch.mock.calls[0]?.[0])).toContain(
    `/operations/${id(2)}/cli-recovery`
  );
  expect(
    new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')
  ).toBe(id(2));
  expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined();
});
it('submits one explicit resume using the existing client authorization options', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(
      {
        status: 'created',
        operationId: id(2),
        account: {
          id: id(3),
          email: ready.email,
          displayName: ready.displayName,
        },
      },
      { status: 201 }
    )
  );
  expect(
    (
      await submitEmployeeCliRecovery(id(2), resume, {
        fetch,
        defaultHeaders: { authorization: 'Bearer synthetic' },
      })
    ).status
  ).toBe('created');
  expect(fetch).toHaveBeenCalledTimes(1);
  const init = fetch.mock.calls[0]?.[1];
  expect(init?.redirect).toBe('error');
  expect(new Headers(init?.headers).get('authorization')).toBe(
    'Bearer synthetic'
  );
  expect(JSON.parse(String(init?.body))).toEqual(resume);
});
it('rejects missing attestation, changed operation, weak password and wrong target readback', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      status: 'created',
      operationId: id(2),
      account: {
        id: id(9),
        email: ready.email,
        displayName: ready.displayName,
      },
    })
  );
  await expect(
    submitEmployeeCliRecovery(id(9), resume, { fetch })
  ).rejects.toThrow('mismatch');
  await expect(
    submitEmployeeCliRecovery(
      id(2),
      { ...resume, temporaryPassword: 'weak' },
      { fetch }
    )
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  await expect(
    submitEmployeeCliRecovery(id(2), resume, { fetch })
  ).rejects.toThrow('inspection');
});
it('does not replay a lost acknowledgement', async () => {
  const fetch = vi.fn(async () => {
    throw new Error('lost');
  });
  await expect(
    submitEmployeeCliRecovery(id(2), resume, { fetch })
  ).rejects.toThrow('lost');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('retains conflict observations without converting them to another CREATE', async () => {
  const fetch = vi.fn(async () =>
    Response.json(
      {
        status: 'conflict',
        operationId: id(2),
        code: 'employee_operation_payload_conflict',
        nextAction: 'inspect',
      },
      { status: 409 }
    )
  );
  expect(
    (await submitEmployeeCliRecovery(id(2), resume, { fetch })).status
  ).toBe('conflict');
  expect(fetch).toHaveBeenCalledTimes(1);
});
