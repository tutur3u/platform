import { z } from 'zod';
import { getInternalApiClient, type InternalApiClientOptions } from '../client';
import { parseInternalApiError } from '../internal-api-error';
import {
  EmployeeCreationPasswordSchema,
  EmployeeCreationReplySchema,
} from './employee-creation';
import {
  EmployeeRejectionAdjudicationSchema,
  EmployeeRejectionRecoverySchema,
} from './employee-rejection-recovery';

export const EmployeeCliRetryReadySchema =
  EmployeeRejectionRecoverySchema.options[2];
export const EmployeeCliRecoveryRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('adjudicate'),
    adjudication: EmployeeRejectionAdjudicationSchema,
  }),
  z.strictObject({
    action: z.literal('resume'),
    expected: EmployeeCliRetryReadySchema,
    temporaryPassword: EmployeeCreationPasswordSchema,
  }),
]);
export type EmployeeCliRecoveryRequest = z.infer<
  typeof EmployeeCliRecoveryRequestSchema
>;
const endpoint = (operationId: string) =>
  `/api/v1/infrastructure/internal-accounts/employees/operations/${z.uuid().parse(operationId)}/cli-recovery`;

export async function inspectEmployeeCliRecovery(
  operationId: string,
  options?: InternalApiClientOptions
) {
  const state = EmployeeRejectionRecoverySchema.parse(
    await getInternalApiClient(options).json<unknown>(endpoint(operationId), {
      cache: 'no-store',
      headers: { 'Idempotency-Key': operationId },
      redirect: 'error',
    })
  );
  if (state.operationId !== operationId)
    throw new Error('Recovery operation mismatch');
  return state;
}

/** Explicit single dispatch. An uncertain acknowledgement requires inspection. */
export async function submitEmployeeCliRecovery(
  operationId: string,
  request: EmployeeCliRecoveryRequest,
  options?: InternalApiClientOptions
) {
  const body = EmployeeCliRecoveryRequestSchema.parse(request);
  const identity = body.action === 'resume' ? body.expected : body.adjudication;
  if (identity.operationId !== operationId)
    throw new Error('Recovery operation mismatch');
  const response = await getInternalApiClient(options).fetch(
    endpoint(operationId),
    {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'x-tuturuuu-account-action': '1',
        'Idempotency-Key': operationId,
      },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok && !(body.action === 'resume' && response.status === 409))
    throw await parseInternalApiError(response);
  const value: unknown = await response.json();
  if (body.action === 'adjudicate') {
    const state = EmployeeCliRetryReadySchema.parse(value);
    for (const key of [
      'actorUserId',
      'operationId',
      'targetUserId',
      'email',
      'displayName',
      'originalLeaseId',
      'originalAttemptEventId',
      'eventId',
      'evidenceReferenceSha256',
    ] as const)
      if (state[key] !== identity[key])
        throw new Error('Recovery adjudication unconfirmed');
    return state;
  }
  const result = EmployeeCreationReplySchema.parse(value);
  if (
    (response.status === 409) !== (result.status === 'conflict') ||
    result.operationId !== operationId ||
    (result.status === 'created' &&
      (result.account.id !== identity.targetUserId ||
        result.account.email !== identity.email ||
        result.account.displayName !== identity.displayName))
  )
    throw new Error('Recovery outcome requires inspection');
  return result;
}
