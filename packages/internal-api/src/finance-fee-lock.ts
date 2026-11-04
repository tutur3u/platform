import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withFinanceApiBaseUrl,
} from './client';
import {
  FEE_LOCK_EXPORT_TOO_MANY_CODE,
  FEE_LOCK_VERSION_CONFLICT_CODE,
  type FeeLockBatchItemResult,
  type FeeLockBatchLockRequest,
  type FeeLockConflictBody,
  type FeeLockDetail,
  type FeeLockExportRequest,
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

/** The export answers with the workbook, or `tooMany` rows (filter by class). */
export type FeeLockExportResult =
  | { ok: true; blob: Blob; fileName: string; rowCount: number }
  | { ok: false; tooMany: number };

/** `POST /finance/fee-locks/export`: the server-built .xlsx as a Blob. */
export async function exportFeeLocks(
  workspaceId: string,
  payload: FeeLockExportRequest,
  options?: InternalApiClientOptions
): Promise<FeeLockExportResult> {
  const response = await getInternalApiClient(
    withFinanceApiBaseUrl(options)
  ).fetch(feeLocksPath(workspaceId, '/export'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  if (response.status === 400) {
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { code?: string; count?: number } | null;
    if (body?.code === FEE_LOCK_EXPORT_TOO_MANY_CODE) {
      return { ok: false, tooMany: Number(body.count) || 0 };
    }
  }
  if (!response.ok) throw await parseInternalApiError(response);
  const disposition = response.headers.get('content-disposition') ?? '';
  return {
    ok: true,
    blob: await response.blob(),
    // The server builds the name from a validated month and the ws id only.
    fileName:
      /filename="([\w.-]+\.xlsx)"/.exec(disposition)?.[1] ??
      'chot-hoc-phi.xlsx',
    rowCount: Number(response.headers.get('x-fee-lock-row-count')) || 0,
  };
}
