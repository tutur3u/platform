import { getInternalApiClient, type InternalApiClientOptions } from '../client';

export type InternalAccountAction =
  | 'disable_access'
  | 'enable_access'
  | 'reset_password'
  | 'update_profile';

export type InternalAccountSortBy =
  | 'createdAt'
  | 'displayName'
  | 'email'
  | 'lastSignInAt';

export type InternalAccountSortDirection = 'asc' | 'desc';

export interface InternalAccount {
  bannedUntil: string | null;
  createdAt: string;
  displayName: string | null;
  email: string;
  emailConfirmedAt: string | null;
  id: string;
  isDisabled: boolean;
  isSelf: boolean;
  lastSignInAt: string | null;
  personalWorkspaceId: string | null;
  storageLimitBytes: number | null;
  storageUsedBytes: number | null;
  username: string | null;
}

export interface ListInternalAccountsParams {
  activeOnly?: boolean;
  cursor?: string;
  limit?: number;
  q?: string;
  sortBy?: InternalAccountSortBy;
  sortDirection?: InternalAccountSortDirection;
  verifiedOnly?: boolean;
}

export interface ListInternalAccountsResponse {
  accounts: InternalAccount[];
  count: number;
  nextCursor: string | null;
}

export type UpdateInternalAccountPayload =
  | {
      action: 'disable_access' | 'enable_access';
      confirmationEmail: string;
    }
  | {
      action: 'reset_password';
      confirmationEmail: string;
      newPassword: string;
    }
  | {
      action: 'update_profile';
      displayName: string;
      username: string | null;
    };

export interface UpdateInternalAccountResponse {
  account: InternalAccount;
  message: string;
}

export async function listInternalAccounts(
  params: ListInternalAccountsParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<ListInternalAccountsResponse>(
    '/api/v1/infrastructure/internal-accounts',
    {
      cache: 'no-store',
      query: {
        activeOnly: params.activeOnly,
        cursor: params.cursor,
        limit: params.limit,
        q: params.q?.trim() || undefined,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
        verifiedOnly: params.verifiedOnly,
      },
    }
  );
}

export async function updateInternalAccount(
  userId: string,
  payload: UpdateInternalAccountPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<UpdateInternalAccountResponse>(
    `/api/v1/infrastructure/internal-accounts/${encodeURIComponent(userId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}
