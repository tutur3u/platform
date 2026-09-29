import { getInternalApiClient, type InternalApiClientOptions } from '../client';

export interface ReviewAccount {
  id: string;
  email: string;
  kind: 'review' | 'external';
  createdAt: string;
  lastSignInAt: string | null;
  isDisabled: boolean;
  emailConfirmed: boolean;
}

export interface CreatedReviewAccount {
  id: string;
  email: string;
  kind: 'review' | 'external';
  password: string | null;
}

const mutationHeaders = {
  'Content-Type': 'application/json',
  'X-Tuturuuu-Account-Action': '1',
};

export async function listReviewAccounts(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<{ accounts: ReviewAccount[] }>(
    '/api/v1/infrastructure/review-accounts',
    { cache: 'no-store' }
  );
}

export async function createReviewAccount(
  input: { email: string; displayName: string; kind: 'review' | 'external' },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<CreatedReviewAccount>(
    '/api/v1/infrastructure/review-accounts',
    {
      body: JSON.stringify(input),
      cache: 'no-store',
      headers: mutationHeaders,
      method: 'POST',
    }
  );
}

export async function updateReviewAccount(
  userId: string,
  input: {
    action: 'rotate_password' | 'disable' | 'enable';
    confirmationEmail: string;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    email: string;
    password: string | null;
  }>(`/api/v1/infrastructure/review-accounts/${encodeURIComponent(userId)}`, {
    body: JSON.stringify(input),
    cache: 'no-store',
    headers: mutationHeaders,
    method: 'PATCH',
  });
}
