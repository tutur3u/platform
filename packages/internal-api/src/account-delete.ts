import { getInternalApiClient, type InternalApiClientOptions } from './client';
import { InternalApiError, parseInternalApiError } from './internal-api-error';

export const ACCOUNT_DELETION_LAST_MANAGER_CODE =
  'ACCOUNT_DELETION_LAST_MANAGER';

export interface AccountDeletionLastManagerWorkspace {
  id: string;
  name: string;
}

/** The actor is the last member manager of workspaces that still have other members. */
export class AccountDeletionLastManagerError extends InternalApiError {
  constructor(
    message: string,
    public readonly workspaces: AccountDeletionLastManagerWorkspace[]
  ) {
    super(message, 409, ACCOUNT_DELETION_LAST_MANAGER_CODE);
    this.name = 'AccountDeletionLastManagerError';
  }
}

export function isAccountDeletionLastManagerError(
  error: unknown
): error is AccountDeletionLastManagerError {
  return error instanceof AccountDeletionLastManagerError;
}

function readLastManagerWorkspaces(
  value: unknown
): AccountDeletionLastManagerWorkspace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { id, name } = entry as { id?: unknown; name?: unknown };
    return typeof id === 'string'
      ? [{ id, name: typeof name === 'string' ? name : '' }]
      : [];
  });
}

async function parseAccountDeleteError(response: Response) {
  if (response.status !== 409) return parseInternalApiError(response);

  let data: { code?: unknown; message?: unknown; workspaces?: unknown };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    return new InternalApiError(
      `Internal API request failed: ${response.status}`,
      response.status
    );
  }
  const message =
    typeof data.message === 'string'
      ? data.message
      : `Internal API request failed: ${response.status}`;
  if (data.code === ACCOUNT_DELETION_LAST_MANAGER_CODE) {
    return new AccountDeletionLastManagerError(
      message,
      readLastManagerWorkspaces(data.workspaces)
    );
  }
  return new InternalApiError(
    message,
    response.status,
    typeof data.code === 'string' ? data.code : undefined
  );
}

export interface AccountDeleteBlockingWorkspace {
  memberCount: number;
  tier: string;
  wsId: string;
  wsName: string;
}

export interface AccountDeleteCleanupSummary {
  seatsToRevoke: number;
  workspacesToDelete: number;
}

export interface AccountDeletePrecheckResponse {
  blockingWorkspaces: AccountDeleteBlockingWorkspace[];
  canDelete: boolean;
  cleanupSummary: AccountDeleteCleanupSummary;
  lastManagerWorkspaces?: AccountDeletionLastManagerWorkspace[];
}

export interface DeleteCurrentUserAccountPayload {
  email: string;
}

export interface DeleteCurrentUserAccountResponse {
  message?: string;
}

export async function getCurrentUserAccountDeletePrecheck(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AccountDeletePrecheckResponse>('/api/v1/users/me/delete', {
    cache: 'no-store',
  });
}

export async function deleteCurrentUserAccount(
  payload: DeleteCurrentUserAccountPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  const response = await client.fetch('/api/v1/users/me/delete', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) throw await parseAccountDeleteError(response);

  return (await response.json()) as DeleteCurrentUserAccountResponse;
}
