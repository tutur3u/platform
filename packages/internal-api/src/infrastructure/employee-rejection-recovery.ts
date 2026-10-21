import { z } from 'zod';
import { getInternalApiClient, type InternalApiClientOptions } from '../client';

export const EmployeeRejectionAttestationSchema = z.strictObject({
  kind: z.literal('administrator-adjudication-v1'),
  terminalAuthRejection: z.literal(true),
  noRequestInFlight: z.literal(true),
  absenceIsNotRejectionProof: z.literal(true),
  acceptResponsibility: z.literal(true),
});
const Identity = z.strictObject({
  actorUserId: z.uuid(),
  operationId: z.uuid(),
  targetUserId: z.uuid(),
  email: z
    .email()
    .max(320)
    .regex(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@tuturuuu\.com$/),
  displayName: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => value === value.trim()),
  originalLeaseId: z.uuid(),
  originalAttemptEventId: z.uuid(),
});
export const EmployeeRejectionAdjudicationSchema = Identity.extend({
  expectedVersion: z.literal(2),
  eventId: z.uuid(),
  evidenceReferenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.literal('administrator_adjudicated_terminal_auth_rejection'),
  attestation: EmployeeRejectionAttestationSchema,
}).strict();
export const EmployeeRejectionRecoverySchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('fenced'), operationId: z.uuid() }),
  Identity.extend({
    status: z.literal('eligible'),
    expectedVersion: z.literal(2),
  }).strict(),
  Identity.extend({
    status: z.literal('retry_ready'),
    expectedVersion: z.literal(3),
    eventId: z.uuid(),
    evidenceReferenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
]);
export const EmployeeRejectionRequestSchema = z.strictObject({
  workspaceId: z.literal('00000000-0000-0000-0000-000000000000'),
  adjudication: EmployeeRejectionAdjudicationSchema,
});
export type EmployeeRejectionRecoveryState = z.infer<
  typeof EmployeeRejectionRecoverySchema
>;
export type EmployeeRejectionAdjudication = z.infer<
  typeof EmployeeRejectionAdjudicationSchema
>;
const endpoint = (operationId: string) =>
  `/api/v1/infrastructure/internal-accounts/employees/operations/${z.uuid().parse(operationId)}/rejection`;
export async function inspectEmployeeRejection(
  operationId: string,
  options?: InternalApiClientOptions
) {
  const result = EmployeeRejectionRecoverySchema.parse(
    await getInternalApiClient(options).json<unknown>(endpoint(operationId), {
      cache: 'no-store',
    })
  );
  if (result.operationId !== operationId)
    throw new Error('Recovery operation mismatch');
  return result;
}
export async function adjudicateEmployeeRejection(
  request: z.infer<typeof EmployeeRejectionRequestSchema>,
  options?: InternalApiClientOptions
) {
  const body = EmployeeRejectionRequestSchema.parse(request);
  const result = EmployeeRejectionRecoverySchema.parse(
    await getInternalApiClient(options).json<unknown>(
      endpoint(body.adjudication.operationId),
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'x-tuturuuu-account-action': '1',
        },
        body: JSON.stringify(body),
      }
    )
  );
  const identity = body.adjudication;
  if (
    result.status !== 'retry_ready' ||
    result.operationId !== identity.operationId ||
    result.actorUserId !== identity.actorUserId ||
    result.targetUserId !== identity.targetUserId ||
    result.email !== identity.email ||
    result.displayName !== identity.displayName ||
    result.originalLeaseId !== identity.originalLeaseId ||
    result.originalAttemptEventId !== identity.originalAttemptEventId ||
    result.eventId !== identity.eventId ||
    result.evidenceReferenceSha256 !== identity.evidenceReferenceSha256
  )
    throw new Error('Recovery adjudication unconfirmed');
  return result;
}
