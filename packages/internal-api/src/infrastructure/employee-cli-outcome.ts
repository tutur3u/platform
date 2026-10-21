import { getInternalApiClient, type InternalApiClientOptions } from '../client';
import { parseInternalApiError } from '../internal-api-error';
import {
  EmployeeCreationObservationSchema,
  EmployeeCreationOperationSchema,
} from './employee-creation';

/** One read with the original CLI credential; no refresh or mutation replay. */
export async function observeEmployeeCliRecoveryOutcome(
  identity: {
    operationId: string;
    targetUserId: string;
    email: string;
    displayName: string;
  },
  options?: InternalApiClientOptions & { signal?: AbortSignal }
) {
  const operationId = EmployeeCreationOperationSchema.parse(
    identity.operationId
  );
  EmployeeCreationOperationSchema.parse(identity.targetUserId);
  const response = await getInternalApiClient(options).fetch(
    `/api/v1/infrastructure/internal-accounts/employees/operations/${operationId}/cli-recovery?view=outcome`,
    {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: options?.signal,
      headers: { 'Idempotency-Key': operationId },
    }
  );
  if (!response.ok) throw await parseInternalApiError(response);
  const result = EmployeeCreationObservationSchema.parse(await response.json());
  if (
    result.status === 'conflict' ||
    response.status !== (result.status === 'pending' ? 202 : 200) ||
    result.operationId !== operationId ||
    (result.status === 'created' &&
      (result.account.id !== identity.targetUserId ||
        result.account.email !== identity.email ||
        ('creationDisplayName' in result.account
          ? result.account.creationDisplayName
          : result.account.displayName) !== identity.displayName))
  )
    throw new Error(
      'Employee operation identity or outcome requires inspection'
    );
  return result;
}
