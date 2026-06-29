import {
  encodePathSegment,
  getInternalApiClient,
} from '@tuturuuu/internal-api/client';
import type {
  InvoiceAnalyticsFilters,
  InvoiceTotalsByGroup,
} from '@tuturuuu/types/primitives/Invoice';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { Product, UserGroupProducts } from './types';
import type { UserGroup } from './utils';

export interface InvoiceAnalyticsResponseDateRange {
  walletData: InvoiceTotalsByGroup[];
  creatorData: InvoiceTotalsByGroup[];
  hasDateRange: true;
  startDate: string;
  endDate: string;
}

export interface InvoiceAnalyticsResponseDefault {
  dailyWalletData: InvoiceTotalsByGroup[];
  weeklyWalletData: InvoiceTotalsByGroup[];
  monthlyWalletData: InvoiceTotalsByGroup[];
  dailyCreatorData: InvoiceTotalsByGroup[];
  weeklyCreatorData: InvoiceTotalsByGroup[];
  monthlyCreatorData: InvoiceTotalsByGroup[];
  hasDateRange: false;
}

export type InvoiceAnalyticsResponse =
  | InvoiceAnalyticsResponseDateRange
  | InvoiceAnalyticsResponseDefault;

export type InvoiceAnalyticsQuery = InvoiceAnalyticsFilters & {
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

export interface InvoiceProductPayload {
  category_id?: string;
  price: number;
  product_id: string;
  quantity: number;
  unit_id: string;
  warehouse_id: string;
}

export interface CreateInvoicePayload {
  category_id?: string;
  content: string;
  customer_id?: string | null;
  frontend_discount_amount?: number;
  frontend_subtotal?: number;
  frontend_total?: number;
  notes?: string;
  products: InvoiceProductPayload[];
  promotion_id?: string;
  wallet_id: string;
}

export interface CreateSubscriptionInvoicePayload extends CreateInvoicePayload {
  customer_id: string;
  group_ids: string[];
  prepaid_month_count?: number;
  selected_month: string;
}

export interface InvoiceMutationResponse {
  data?: {
    calculated_values: {
      discount_amount: number;
      rounding_applied: number;
      subtotal: number;
      total: number;
    };
    coverage_end_month?: string;
    coverage_start_month?: string;
    frontend_values?: {
      discount_amount?: number;
      subtotal?: number;
      total?: number;
    };
    prepaid_month_count?: number;
    valid_until?: string;
    values_recalculated?: boolean;
  };
  invoice_id: string;
  message: string;
}

export interface UpdateInvoicePayload {
  note?: string | null;
  notice?: string | null;
  wallet_id?: string | null;
}

export interface WorkspaceUsersResponse {
  data: WorkspaceUser[];
  count: number;
}

export interface WorkspaceUsersQuery {
  from?: number;
  limit?: number;
  q?: string;
  to?: number;
}

export interface InvoiceProductListResponse {
  data?: Product[];
  count?: number;
}

export interface WorkspacePromotionRecord {
  id: string;
  name: string | null;
  code: string | null;
  value: number | null;
  use_ratio: boolean | null;
  description?: string | null;
  promo_type?: string | null;
  max_uses?: number | null;
  current_uses?: number | null;
}

export interface WorkspaceUserLinkedPromotion {
  promo_id: string | null;
  workspace_promotions?: {
    id?: string | null;
    name?: string | null;
    description?: string | null;
    code?: string | null;
    value?: number | null;
    use_ratio?: boolean | null;
    promo_type?: string | null;
    max_uses?: number | null;
    current_uses?: number | null;
  } | null;
}

export interface WorkspaceUserReferralDiscount {
  promo_id: string | null;
  calculated_discount_value: number | null;
}

export interface CreatePromotionPayload {
  code: string;
  description?: string;
  max_uses?: number | null;
  name: string;
  unit: 'percentage' | 'currency';
  value: number;
}

function appendArrayParam(
  searchParams: URLSearchParams,
  key: string,
  values?: string[]
) {
  for (const value of values ?? []) {
    if (value) {
      searchParams.append(key, value);
    }
  }
}

function buildInvoiceAnalyticsSearchParams(query: InvoiceAnalyticsQuery) {
  const searchParams = new URLSearchParams();

  appendArrayParam(searchParams, 'walletIds', query.walletIds);
  appendArrayParam(searchParams, 'userIds', query.userIds);

  if (query.startDate) searchParams.set('start', query.startDate);
  if (query.endDate) searchParams.set('end', query.endDate);
  if (query.granularity) searchParams.set('granularity', query.granularity);
  if (query.weekStartsOn !== undefined) {
    searchParams.set('weekStartsOn', String(query.weekStartsOn));
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

export function getInvoiceAnalyticsWithInternalApi(
  workspaceId: string,
  query: InvoiceAnalyticsQuery = {}
) {
  const client = getInternalApiClient();
  return client.json<InvoiceAnalyticsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/analytics${buildInvoiceAnalyticsSearchParams(query)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceUsersWithInternalApi(
  workspaceId: string,
  query: WorkspaceUsersQuery = {}
) {
  const client = getInternalApiClient();
  const payload = await client.json<
    WorkspaceUser[] | { data?: WorkspaceUser[]; count?: number }
  >(`/api/v1/workspaces/${encodePathSegment(workspaceId)}/users`, {
    cache: 'no-store',
    query: {
      from: query.from,
      limit: query.limit,
      q: query.q,
      to: query.to,
    },
  });

  if (Array.isArray(payload)) {
    return {
      data: payload,
      count: payload.length,
    } satisfies WorkspaceUsersResponse;
  }

  return {
    data: payload.data ?? [],
    count: payload.count ?? payload.data?.length ?? 0,
  } satisfies WorkspaceUsersResponse;
}

export async function getWorkspaceUserWithInternalApi(
  workspaceId: string,
  userId: string
) {
  const client = getInternalApiClient();
  const payload = await client.json<WorkspaceUser[] | WorkspaceUser>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/${encodePathSegment(userId)}`,
    {
      cache: 'no-store',
    }
  );

  if (Array.isArray(payload)) {
    return payload[0] ?? null;
  }

  return payload ?? null;
}

export async function listInvoiceProductsWithInternalApi(workspaceId: string) {
  const client = getInternalApiClient();
  const products: Product[] = [];
  const pageSize = 500;
  let page = 1;
  let count = 0;

  do {
    const payload = await client.json<InvoiceProductListResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/inventory/products`,
      {
        cache: 'no-store',
        query: {
          page,
          pageSize,
        },
      }
    );

    products.push(...(payload.data ?? []));
    count = payload.count ?? products.length;
    page += 1;
  } while (products.length < count);

  return products;
}

export function listPromotionsWithInternalApi(workspaceId: string) {
  const client = getInternalApiClient();
  return client.json<WorkspacePromotionRecord[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/promotions`,
    {
      cache: 'no-store',
    }
  );
}

export function createPromotionWithInternalApi(
  workspaceId: string,
  payload: CreatePromotionPayload
) {
  const client = getInternalApiClient();
  return client.json<{ data: WorkspacePromotionRecord; message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/promotions`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export function updatePromotionWithInternalApi(
  workspaceId: string,
  promotionId: string,
  payload: CreatePromotionPayload
) {
  const client = getInternalApiClient();
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/promotions/${encodePathSegment(promotionId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export function listUserGroupsWithInternalApi(
  workspaceId: string,
  userId: string
) {
  const client = getInternalApiClient();
  return client.json<UserGroup[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/${encodePathSegment(userId)}/user-groups`,
    {
      cache: 'no-store',
    }
  );
}

export async function listUserGroupProductsWithInternalApi(
  workspaceId: string,
  groupId: string
) {
  const client = getInternalApiClient();
  const payload = await client.json<{
    items?: Array<{
      id: string;
      name: string | null;
      description?: string | null;
      warehouse_id: string | null;
      unit_id: string | null;
    }>;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/linked-products`,
    {
      cache: 'no-store',
    }
  );

  return (payload.items ?? []).map((item) => ({
    workspace_products: {
      id: item.id,
      name: item.name,
      product_categories: {
        name: null,
      },
    },
    inventory_units: item.unit_id
      ? {
          id: item.unit_id,
          name: null,
        }
      : null,
    warehouse_id: item.warehouse_id,
  })) as UserGroupProducts[];
}

export function listMultiGroupProductsWithInternalApi(
  workspaceId: string,
  groupIds: string[]
) {
  const client = getInternalApiClient();
  const searchParams = new URLSearchParams();

  for (const groupId of groupIds) {
    searchParams.append('groupIds', groupId);
  }

  return client
    .json<{ items?: Array<UserGroupProducts & { group_id?: string }> }>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/linked-products?${searchParams.toString()}`,
      {
        cache: 'no-store',
      }
    )
    .then((payload) => payload.items ?? []);
}

export function listUserLinkedPromotionsWithInternalApi(
  workspaceId: string,
  userId: string
) {
  const client = getInternalApiClient();
  return client.json<WorkspaceUserLinkedPromotion[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/${encodePathSegment(userId)}/linked-promotions`,
    {
      cache: 'no-store',
    }
  );
}

export function listUserReferralDiscountsWithInternalApi(
  workspaceId: string,
  userId: string
) {
  const client = getInternalApiClient();
  return client.json<WorkspaceUserReferralDiscount[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/${encodePathSegment(userId)}/referral-discounts`,
    {
      cache: 'no-store',
    }
  );
}

export function createInvoiceWithInternalApi(
  workspaceId: string,
  payload: CreateInvoicePayload
) {
  const client = getInternalApiClient();
  return client.json<InvoiceMutationResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export function createSubscriptionInvoiceWithInternalApi(
  workspaceId: string,
  payload: CreateSubscriptionInvoicePayload
) {
  const client = getInternalApiClient();
  return client.json<InvoiceMutationResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/subscription`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export function updateInvoiceWithInternalApi(
  workspaceId: string,
  invoiceId: string,
  payload: UpdateInvoicePayload
) {
  const client = getInternalApiClient();
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/${encodePathSegment(invoiceId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}
