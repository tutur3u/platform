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
    Response.json(
      {
        status: 'created',
        operationId: id(2),
        account: {
          id: id(9),
          email: ready.email,
          displayName: ready.displayName,
        },
      },
      { status: 201 }
    )
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

const adjudicateRequest = {
  action: 'adjudicate' as const,
  adjudication: {
    actorUserId: ready.actorUserId,
    operationId: ready.operationId,
    targetUserId: ready.targetUserId,
    email: ready.email,
    displayName: ready.displayName,
    originalLeaseId: ready.originalLeaseId,
    originalAttemptEventId: ready.originalAttemptEventId,
    expectedVersion: 2 as const,
    eventId: ready.eventId,
    evidenceReferenceSha256: ready.evidenceReferenceSha256,
    reason: 'administrator_adjudicated_terminal_auth_rejection' as const,
    attestation: {
      kind: 'administrator-adjudication-v1' as const,
      terminalAuthRejection: true as const,
      noRequestInFlight: true as const,
      absenceIsNotRejectionProof: true as const,
      acceptResponsibility: true as const,
    },
  },
};
const outcomes = [
  {
    status: 'created',
    operationId: id(2),
    account: { id: id(3), email: ready.email, displayName: ready.displayName },
  },
  {
    status: 'pending',
    operationId: id(2),
    code: 'account_creation_outcome_unknown',
    nextAction: 'inspect',
  },
  {
    status: 'pending',
    operationId: id(2),
    code: 'employee_provisioning_pending',
    nextAction: 'inspect',
  },
  {
    status: 'conflict',
    operationId: id(2),
    code: 'employee_account_conflict',
    nextAction: 'inspect',
  },
  {
    status: 'conflict',
    operationId: id(2),
    code: 'employee_operation_payload_conflict',
    nextAction: 'inspect',
  },
];
it.each([200, 201, 202, 203, 206, 207, 299, 409])(
  'enforces every resume outcome pairing at HTTP %s without replay',
  async (httpStatus) => {
    for (const outcome of outcomes) {
      const fetch = vi.fn(async () =>
        Response.json(outcome, { status: httpStatus })
      );
      const result = submitEmployeeCliRecovery(id(2), resume, { fetch });
      const expected =
        outcome.status === 'created'
          ? 201
          : outcome.status === 'pending'
            ? 202
            : 409;
      if (httpStatus === expected)
        await expect(result).resolves.toEqual(outcome);
      else await expect(result).rejects.toThrow('inspection');
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  }
);
it.each([200, 201, 202, 203, 206, 207, 299])(
  'accepts matching adjudication readback only at HTTP 200 (%s)',
  async (httpStatus) => {
    const fetch = vi.fn(async () =>
      Response.json(ready, { status: httpStatus })
    );
    const result = submitEmployeeCliRecovery(id(2), adjudicateRequest, {
      fetch,
    });
    if (httpStatus === 200) await expect(result).resolves.toEqual(ready);
    else await expect(result).rejects.toThrow('inspection');
    expect(fetch).toHaveBeenCalledTimes(1);
  }
);
it.each([400, 401, 403, 404, 409, 422, 500, 503])(
  'rejects error HTTP %s despite matching payloads with one dispatch',
  async (status) => {
    for (const body of [resume, adjudicateRequest]) {
      const payload = body.action === 'resume' ? outcomes[0] : ready;
      const fetch = vi.fn(async () => Response.json(payload, { status }));
      await expect(
        submitEmployeeCliRecovery(id(2), body, { fetch })
      ).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  }
);
it.each([resume, adjudicateRequest])(
  'rejects bodyless success without completion or replay',
  async (body) => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(
      submitEmployeeCliRecovery(id(2), body, { fetch })
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  }
);
