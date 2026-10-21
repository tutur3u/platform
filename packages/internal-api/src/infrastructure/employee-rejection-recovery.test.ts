import { expect, it, vi } from 'vitest';
import {
  adjudicateEmployeeRejection,
  EmployeeRejectionRequestSchema,
  inspectEmployeeRejection,
} from './employee-rejection-recovery';

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const body = EmployeeRejectionRequestSchema.parse({
  workspaceId: '00000000-0000-0000-0000-000000000000',
  adjudication: {
    actorUserId: id(1),
    operationId: id(2),
    targetUserId: id(3),
    email: 'staff@tuturuuu.com',
    displayName: 'Staff',
    originalLeaseId: id(4),
    originalAttemptEventId: id(5),
    expectedVersion: 2,
    eventId: id(6),
    evidenceReferenceSha256: 'a'.repeat(64),
    reason: 'administrator_adjudicated_terminal_auth_rejection',
    attestation: {
      kind: 'administrator-adjudication-v1',
      terminalAuthRejection: true,
      noRequestInFlight: true,
      absenceIsNotRejectionProof: true,
      acceptResponsibility: true,
    },
  },
});
const {
  reason: _reason,
  attestation: _attestation,
  ...identity
} = body.adjudication;
const ready = { ...identity, status: 'retry_ready', expectedVersion: 3 };
it('uses the explicit action header once and validates the original repair receipt', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(ready)
  );
  expect(await adjudicateEmployeeRejection(body, { fetch })).toEqual(ready);
  expect(fetch).toHaveBeenCalledTimes(1);
  const init = fetch.mock.calls[0]?.[1];
  expect(new Headers(init?.headers).get('x-tuturuuu-account-action')).toBe('1');
  expect(init?.method).toBe('POST');
  expect(JSON.parse(String(init?.body))).toEqual(body);
});
it('never retries an ambiguous mutation acknowledgement', async () => {
  const fetch = vi.fn(async () => {
    throw new Error('lost');
  });
  await expect(adjudicateEmployeeRejection(body, { fetch })).rejects.toThrow(
    'lost'
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('rejects wrong operation readback or a different audit event', async () => {
  await expect(
    inspectEmployeeRejection(id(2), {
      fetch: async () =>
        Response.json({ status: 'fenced', operationId: id(9) }),
    })
  ).rejects.toThrow('mismatch');
  await expect(
    adjudicateEmployeeRejection(body, {
      fetch: async () => Response.json({ ...ready, eventId: id(9) }),
    })
  ).rejects.toThrow('unconfirmed');
});
