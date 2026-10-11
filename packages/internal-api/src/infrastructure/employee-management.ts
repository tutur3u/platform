import { getInternalApiClient, type InternalApiClientOptions } from '../client';
import type {
  RestoreInternalEmployeePayload,
  RestoreInternalEmployeeResponse,
} from './employee-restoration';

export type InternalEmployeeNextAction =
  | 'none'
  | 'restore'
  | 'inspect'
  | 'creation_reconciliation_required'
  | 'adoption_required'
  | 'manual_review';

export interface InternalEmployeeInspection {
  id: string;
  email: string | null;
  registryState: 'absent' | 'pending' | 'provisioned' | 'active';
  managedName: string | null;
  managementRoleLabel: string | null;
  revision: number | null;
  mailboxReady: boolean;
  readinessCode:
    | 'ready'
    | 'not_managed'
    | 'creation_pending'
    | 'tuple_conflict'
    | 'mailbox_unavailable';
  reservation: 'none' | 'exact_intent' | 'conflicting_tuple';
  managed: boolean;
  operation: {
    operationId: string;
    revision: number;
    phase: 'reserved' | 'attempted' | 'unknown' | 'completed';
  } | null;
  /** Private administrator detail, never a directory-row field. */
  recovery: { email: string | null; verified: boolean } | null;
  providerState:
    | 'confirmed_active'
    | 'confirmed_banned'
    | 'unconfirmed'
    | 'missing'
    | 'unknown';
}

export interface InternalEmployeeManagement extends InternalEmployeeInspection {
  providerReadAt: string;
  nextAction: InternalEmployeeNextAction;
}

export type ReconcileInternalEmployeeResponse =
  | RestoreInternalEmployeeResponse
  | {
      status: 'observed';
      observation: InternalEmployeeInspection;
      nextAction: InternalEmployeeNextAction;
    };

export function getInternalEmployeeManagement(
  userId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InternalEmployeeManagement>(
    `/api/v1/infrastructure/internal-accounts/employees/${encodeURIComponent(userId)}`,
    { cache: 'no-store' }
  );
}

/** Inspect a retained operation; this endpoint never launches activation. */
export function reconcileInternalEmployee(
  userId: string,
  payload: RestoreInternalEmployeePayload & { operationId?: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ReconcileInternalEmployeeResponse>(
    `/api/v1/infrastructure/internal-accounts/employees/${encodeURIComponent(userId)}/reconcile`,
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
