import type { AccountBenefit } from '@tuturuuu/types/primitives/playgrounds';
import { getInternalApiClient, type InternalApiClientOptions } from '../client';

const path = '/api/v1/admin/account-benefits';
export function listAccountBenefits(
  userId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<AccountBenefit[]>(path, {
    query: { userId },
    cache: 'no-store',
  });
}
export function grantAccountBenefit(
  payload: {
    userId: string;
    key: string;
    amount: number;
    reason: string;
    expiresAt: string | null;
    requestId: string;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<AccountBenefit>(path, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
}
export function revokeAccountBenefit(
  id: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<boolean>(path, {
    method: 'DELETE',
    body: JSON.stringify({ id }),
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
}
