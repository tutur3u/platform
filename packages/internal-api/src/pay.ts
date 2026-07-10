import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withPayApiBaseUrl,
} from './client';

export type WorkspaceBillingSummary = {
  isPersonalWorkspace: boolean;
  subscription: null | {
    billingCycle: string | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    maxSeats: number | null;
    name: string;
    seatCount: number | null;
    status: string;
    tier: string | null;
  };
};

export type WorkspaceAiCreditStatus = {
  bonusCredits: number;
  included: {
    bonusCredits: number;
    remaining: number;
    totalAllocated: number;
    totalUsed: number;
  };
  payg: {
    nextExpiry: string | null;
    remaining: number;
    totalGranted: number;
    totalUsed: number;
  };
  percentUsed: number;
  remaining: number;
  totalAllocated: number;
  totalUsed: number;
};

export function getPayWorkspaceBillingSummary(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withPayApiBaseUrl(options));

  return client.json<WorkspaceBillingSummary>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/billing/summary`,
    { cache: 'no-store' }
  );
}

export function getPayWorkspaceAiCreditStatus(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  return getPayClient(options).json<WorkspaceAiCreditStatus>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/ai/credits`,
    { cache: 'no-store' }
  );
}

function getPayClient(options?: InternalApiClientOptions) {
  return getInternalApiClient(withPayApiBaseUrl(options));
}

export function createPayCreditPackCheckout(
  payload: { creditPackId: string; wsId: string },
  options?: InternalApiClientOptions
) {
  return getPayClient(options).json<{ url: string }>(
    '/api/payment/credit-packs/checkouts',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function createPaySubscriptionCheckout(
  subscriptionId: string,
  payload: { productId: string; wsId: string },
  options?: InternalApiClientOptions
) {
  return getPayClient(options).json<{ url: string }>(
    `/api/payment/subscriptions/${encodePathSegment(subscriptionId)}/checkouts`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function getPaySubscriptionChangePreview<T>(
  subscriptionId: string,
  productId: string,
  options?: InternalApiClientOptions
) {
  return getPayClient(options).json<T>(
    `/api/payment/subscriptions/${encodePathSegment(subscriptionId)}/preview`,
    {
      body: JSON.stringify({ productId }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function changePaySubscriptionPlan(
  subscriptionId: string,
  productId: string,
  options?: InternalApiClientOptions
) {
  return getPayClient(options).json<{ success?: boolean }>(
    `/api/payment/subscriptions/${encodePathSegment(subscriptionId)}/change`,
    {
      body: JSON.stringify({ productId }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function updatePaySubscriptionCancellation(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean,
  options?: InternalApiClientOptions
) {
  return getPayClient(options).json<{ success?: boolean }>(
    `/api/payment/customer-portal/subscriptions/${encodePathSegment(subscriptionId)}`,
    {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: cancelAtPeriodEnd ? 'DELETE' : 'PATCH',
    }
  );
}

export function updatePaySubscriptionSeats(
  payload: { newSeatCount: number; wsId: string },
  options?: InternalApiClientOptions
) {
  return getPayClient(options).json<{ newSeats: number }>(
    '/api/payment/seats',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function getPayOrderInvoiceUrl(
  orderId: string,
  options?: InternalApiClientOptions
) {
  const path = `/api/payment/orders/${encodePathSegment(orderId)}/invoice`;
  const client = getPayClient(options);

  await client.json<unknown>(path, { cache: 'no-store', method: 'POST' });
  return client.json<{ url?: string }>(path, { cache: 'no-store' });
}
