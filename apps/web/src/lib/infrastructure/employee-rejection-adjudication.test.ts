import { describe, expect, it, vi } from 'vitest';
import { adjudicateEmployeeCreationRejection } from './employee-rejection-adjudication';

vi.mock('server-only', () => ({}));
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const request = {
  actorUserId: id(1),
  operationId: id(2),
  targetUserId: id(3),
  email: 'adjudication@tuturuuu.com',
  displayName: 'Employee',
  expectedVersion: 2,
  originalLeaseId: id(4),
  originalAttemptEventId: id(5),
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
};
const operation = {
  actorUserId: id(1),
  operationId: id(2),
  targetUserId: id(3),
  email: request.email,
  displayName: request.displayName,
  phase: 'reserved',
  version: 3,
  leaseId: id(7),
  leaseExpiresAt: 1,
  revoked: false,
  lastReceipt: null,
};
describe('explicit rejected creation adjudication', () => {
  it('rejects missing attestation before authorization or RPC', async () => {
    const authorize = vi.fn();
    const call = vi.fn();
    await expect(
      adjudicateEmployeeCreationRejection({
        request: { ...request, attestation: {} },
        authorize,
        call,
      })
    ).rejects.toThrow();
    expect(authorize).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });
  it('requires fresh authorization for the exact original actor', async () => {
    for (const actor of [null, { actorUserId: id(8) }]) {
      const call = vi.fn();
      await expect(
        adjudicateEmployeeCreationRejection({
          request,
          authorize: async () => actor,
          call,
        })
      ).rejects.toThrow('denied');
      expect(call).not.toHaveBeenCalled();
    }
  });
  it('binds the audit and original attempt without persisting credentials', async () => {
    const call = vi.fn<(body: object) => Promise<unknown>>(async () => ({
      kind: 'adjudicated',
      operation,
    }));
    await expect(
      adjudicateEmployeeCreationRejection({
        request,
        authorize: async () => ({ actorUserId: id(1) }),
        call,
      })
    ).resolves.toEqual({ kind: 'adjudicated', operation });
    expect(call.mock.calls[0]?.[0]).toMatchObject({
      p_original_attempt_event_id: id(5),
      p_original_lease_id: id(4),
      p_expected_version: 2,
      p_adjudicator_id: id(1),
      p_attestation: request.attestation,
    });
  });
  it('rejects a changed target or unfenced response', async () => {
    for (const changed of [
      { ...operation, targetUserId: id(9) },
      { ...operation, leaseId: id(4) },
      { ...operation, phase: 'active' },
    ]) {
      await expect(
        adjudicateEmployeeCreationRejection({
          request,
          authorize: async () => ({ actorUserId: id(1) }),
          call: async () => ({ kind: 'adjudicated', operation: changed }),
        })
      ).rejects.toThrow('unconfirmed');
    }
  });
  it('never retries an ambiguous repair acknowledgement', async () => {
    const call = vi.fn(async () => {
      throw new Error('lost');
    });
    await expect(
      adjudicateEmployeeCreationRejection({
        request,
        authorize: async () => ({ actorUserId: id(1) }),
        call,
      })
    ).rejects.toThrow('lost');
    expect(call).toHaveBeenCalledTimes(1);
  });
});
