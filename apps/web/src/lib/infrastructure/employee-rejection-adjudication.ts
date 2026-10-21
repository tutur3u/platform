import 'server-only';
import { EmployeeRejectionAdjudicationSchema } from '@tuturuuu/internal-api/infrastructure/employee-rejection-recovery';
import { z } from 'zod';
import { EmployeeOperationSnapshotSchema } from './employee-creation-operation-store';

export {
  EmployeeRejectionAdjudicationSchema,
  EmployeeRejectionAttestationSchema,
} from '@tuturuuu/internal-api/infrastructure/employee-rejection-recovery';

// Deliberately separate from CREATE and the automatic observation/retry ports.
// The caller supplies a fresh request authorization, never a cached actor proof.
export async function adjudicateEmployeeCreationRejection(input: {
  request: unknown;
  authorize: () => Promise<{ actorUserId: string } | null>;
  call: (body: object) => Promise<unknown>;
}) {
  const request = EmployeeRejectionAdjudicationSchema.parse(input.request);
  const authorization = await input.authorize();
  if (!authorization || authorization.actorUserId !== request.actorUserId)
    throw new Error('employee_rejection_adjudication_denied');
  const result = z
    .strictObject({
      kind: z.literal('adjudicated'),
      operation: EmployeeOperationSnapshotSchema,
    })
    .parse(
      await input.call({
        p_adjudicator_id: authorization.actorUserId,
        p_actor_id: request.actorUserId,
        p_operation_id: request.operationId,
        p_target_id: request.targetUserId,
        p_email: request.email,
        p_name: request.displayName,
        p_expected_version: request.expectedVersion,
        p_original_lease_id: request.originalLeaseId,
        p_original_attempt_event_id: request.originalAttemptEventId,
        p_event_id: request.eventId,
        p_evidence_reference_sha256: request.evidenceReferenceSha256,
        p_reason: request.reason,
        p_attestation: request.attestation,
      })
    );
  const op = result.operation;
  if (
    op.actorUserId !== request.actorUserId ||
    op.operationId !== request.operationId ||
    op.targetUserId !== request.targetUserId ||
    op.email !== request.email ||
    op.displayName !== request.displayName ||
    op.phase !== 'reserved' ||
    op.version !== 3 ||
    op.revoked ||
    op.leaseId === null ||
    op.leaseId === request.originalLeaseId ||
    op.leaseExpiresAt > Date.now() ||
    op.lastReceipt !== null
  )
    throw new Error('employee_rejection_adjudication_unconfirmed');
  return result;
}
