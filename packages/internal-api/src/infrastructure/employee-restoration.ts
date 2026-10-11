import { getInternalApiClient, type InternalApiClientOptions } from '../client';

export interface RestoreInternalEmployeePayload {
  confirmationEmail: string;
  expectedRevision: number;
}

export type RestoreInternalEmployeeResponse =
  | {
      status: 'restored';
      account: { id: string; email: string; displayName: string };
      operationId: string;
      revision: number;
    }
  | {
      status: 'pending';
      code:
        | 'employee_restore_outcome_unknown'
        | 'employee_restore_confirmation_pending';
      operationId: string;
      nextAction: 'inspect';
      message: string;
    };

export async function restoreInternalEmployee(
  userId: string,
  payload: RestoreInternalEmployeePayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<RestoreInternalEmployeeResponse>(
    `/api/v1/infrastructure/internal-accounts/employees/${encodeURIComponent(userId)}/restore`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'x-tuturuuu-account-action': '1',
      },
      body: JSON.stringify(payload),
    }
  );
}
