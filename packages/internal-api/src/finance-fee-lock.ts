import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withFinanceApiBaseUrl,
} from './client';
import {
  FEE_LOCK_VERSION_CONFLICT_CODE,
  type FeeLockBatchItemResult,
  type FeeLockBatchLockRequest,
  type FeeLockConflictBody,
  type FeeLockDetail,
  type FeeLockHeader,
  type FeeLockListQuery,
  type FeeLockListResponse,
  type FeeLockSaveDraftRequest,
} from './finance-fee-lock-contracts';
import { parseInternalApiError } from './internal-api-error';

export * from './finance-fee-lock-contracts';

/** Mutations resolve to a conflict instead of throwing on HTTP 409. */
export type FeeLockMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; conflict: FeeLockConflictBody };

function feeLocksPath(workspaceId: string, suffix = '') {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/fee-locks${suffix}`;
}

function lockPath(workspaceId: string, lockId: string, action = '') {
  return feeLocksPath(
    workspaceId,
    `/${encodePathSegment(lockId)}${action ? `/${action}` : ''}`
  );
}

async function sendFeeLockMutation<T>(
  path: string,
  method: 'POST' | 'PUT',
  body: unknown,
  options?: InternalApiClientOptions
): Promise<FeeLockMutationResult<T>> {
  const response = await getInternalApiClient(
    withFinanceApiBaseUrl(options)
  ).fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (response.status === 409) {
    const conflict = (await response
      .clone()
      .json()
      .catch(() => null)) as FeeLockConflictBody | null;
    if (conflict?.code === FEE_LOCK_VERSION_CONFLICT_CODE) {
      return { ok: false, conflict };
    }
  }
  if (!response.ok) throw await parseInternalApiError(response);
  return { ok: true, data: (await response.json()) as T };
}

export function listFeeLocks(
  workspaceId: string,
  query: FeeLockListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(
    withFinanceApiBaseUrl(options)
  ).json<FeeLockListResponse>(feeLocksPath(workspaceId), {
    query: { ...query },
    cache: 'no-store',
  });
}

export function getFeeLock(
  workspaceId: string,
  lockId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(
    withFinanceApiBaseUrl(options)
  ).json<FeeLockDetail>(lockPath(workspaceId, lockId), { cache: 'no-store' });
}

export function saveFeeLockDraft(
  workspaceId: string,
  payload: FeeLockSaveDraftRequest,
  options?: InternalApiClientOptions
) {
  return sendFeeLockMutation<FeeLockDetail>(
    feeLocksPath(workspaceId),
    'PUT',
    payload,
    options
  );
}

export function lockFeeLock(
  workspaceId: string,
  lockId: string,
  payload: { expected_version: number },
  options?: InternalApiClientOptions
) {
  return sendFeeLockMutation<FeeLockHeader>(
    lockPath(workspaceId, lockId, 'lock'),
    'POST',
    payload,
    options
  );
}

export function reopenFeeLock(
  workspaceId: string,
  lockId: string,
  payload: { expected_version: number; reason: string },
  options?: InternalApiClientOptions
) {
  return sendFeeLockMutation<FeeLockHeader>(
    lockPath(workspaceId, lockId, 'reopen'),
    'POST',
    payload,
    options
  );
}

export function lockFeeLockBatch(
  workspaceId: string,
  payload: FeeLockBatchLockRequest,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withFinanceApiBaseUrl(options)).json<{
    results: FeeLockBatchItemResult[];
  }>(feeLocksPath(workspaceId, '/lock-batch'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
}
