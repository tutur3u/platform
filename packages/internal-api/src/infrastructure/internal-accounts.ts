import { getInternalApiClient, type InternalApiClientOptions } from '../client';

export type InternalAccountAction =
  | 'disable_access'
  | 'enable_access'
  | 'reset_password';

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
}

export interface ListInternalAccountsParams {
  q?: string;
}

export interface ListInternalAccountsResponse {
  accounts: InternalAccount[];
  count: number;
}

export interface UpdateInternalAccountPayload {
  action: InternalAccountAction;
  confirmationEmail: string;
  newPassword?: string;
}

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
        q: params.q?.trim() || undefined,
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
