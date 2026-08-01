import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
  withFinanceApiBaseUrl,
} from './client';

export type InventoryFinanceProvider =
  | 'cash'
  | 'polar'
  | 'square_pos'
  | 'square_terminal';
export type InventoryFinanceExternalProvider = Exclude<
  InventoryFinanceProvider,
  'cash'
>;

export type InventoryFinanceEntryKind =
  | 'sale'
  | 'refund'
  | 'chargeback_hold'
  | 'chargeback_release'
  | 'manual_provider_adjustment';

export type InventoryFinanceEntryStatus = 'pending' | 'linked' | 'error';

export interface InventoryFinanceSourceMetadata {
  checkoutId: string | null;
  entryId: string;
  inventoryHref: string;
  kind: InventoryFinanceEntryKind;
  provider: InventoryFinanceProvider;
  providerReferenceId: string;
  reconciliationHref: string;
}

export interface InventoryFinanceEntry {
  allocations: Array<{
    allocationSource:
      | 'current_stock_backfill'
      | 'direct'
      | 'equal_weight_fallback'
      | 'legacy_charged'
      | 'stock_snapshot';
    catalogBasisAmount: number;
    lineId: string;
    productId: string;
    quantity: number;
    recognizedRevenueAmount: number;
    title: string;
  }>;
  amount: number;
  amountMinor: number;
  category: { id: string; name: string } | null;
  checkoutId: string | null;
  currency: string;
  customer: { email: string | null; name: string | null } | null;
  id: string;
  kind: InventoryFinanceEntryKind;
  occurredAt: string;
  provider: InventoryFinanceProvider;
  providerReferenceId: string;
  providerStatus: string | null;
  source: InventoryFinanceSourceMetadata;
  status: InventoryFinanceEntryStatus;
  synchronizationError: string | null;
  transactionId: string | null;
  wallet: { id: string; name: string } | null;
}

export interface InventoryFinanceCurrencyAmount {
  amount: number;
  amountMinor: number;
  count: number;
  currency: string;
}

export interface InventoryFinanceProviderSummary {
  chargebackHolds: InventoryFinanceCurrencyAmount[];
  chargebackReleases: InventoryFinanceCurrencyAmount[];
  grossSales: InventoryFinanceCurrencyAmount[];
  netSales: InventoryFinanceCurrencyAmount[];
  provider: InventoryFinanceProvider;
  refunds: InventoryFinanceCurrencyAmount[];
}

export interface InventoryFinanceReconciliationSummary {
  chargebackHolds: InventoryFinanceCurrencyAmount[];
  chargebackReleases: InventoryFinanceCurrencyAmount[];
  grossSales: InventoryFinanceCurrencyAmount[];
  netSales: InventoryFinanceCurrencyAmount[];
  pending: InventoryFinanceCurrencyAmount[];
  providers: InventoryFinanceProviderSummary[];
  refunds: InventoryFinanceCurrencyAmount[];
}

export interface InventoryFinanceListQuery {
  cursor?: string;
  endDate?: string;
  kind?: InventoryFinanceEntryKind;
  limit?: number;
  provider?: InventoryFinanceProvider;
  startDate?: string;
  status?: InventoryFinanceEntryStatus;
  currency?: string;
  walletId?: string;
}

export interface InventoryFinanceListResponse {
  data: InventoryFinanceEntry[];
  hasMore: boolean;
  nextCursor: string | null;
  summary: InventoryFinanceReconciliationSummary;
}

export interface InventoryFinanceMapping {
  category: { id: string; name: string } | null;
  categoryId: string | null;
  currency: string;
  provider: InventoryFinanceExternalProvider;
  wallet: { id: string; name: string } | null;
  walletId: string | null;
}

export interface PutInventoryFinanceMappingsPayload {
  mappings: Array<{
    categoryId?: string | null;
    currency: string;
    provider: InventoryFinanceExternalProvider;
    walletId?: string | null;
  }>;
}

export interface InventoryFinanceBulkLinkPayload {
  categoryId?: string | null;
  entryIds: string[];
  walletId: string;
}

export interface InventoryFinanceBulkUnlinkPayload {
  entryIds: string[];
}

export interface InventoryFinanceBulkResult {
  count: number;
  entries: Array<{
    entryId: string;
    status: InventoryFinanceEntryStatus;
    transactionId: string | null;
  }>;
}

export interface InventoryFinanceProviderSyncPayload {
  cursor?: string;
  environment?: 'production' | 'sandbox';
  limit?: number;
  provider: 'polar' | 'square';
}

export interface InventoryFinanceProviderSyncResult {
  failed: number;
  hasMore: boolean;
  nextCursor: string | null;
  processed: number;
  scanned: number;
}

export interface InventoryFinanceManualAdjustmentPayload {
  amountMinor: number;
  checkoutId: string;
  idempotencyKey: string;
  occurredAt?: string;
  reason: string;
}

export interface InventoryFinanceManualAdjustmentResult {
  entryId: string;
  status: InventoryFinanceEntryStatus;
  transactionId: string | null;
}

const reconciliationPath = (workspaceId: string) =>
  `/api/workspaces/${encodePathSegment(workspaceId)}/finance/inventory-reconciliation`;

export async function listInventoryFinanceEntries(
  workspaceId: string,
  query: InventoryFinanceListQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  const apiQuery: InternalApiQuery = { ...query };
  return client.json<InventoryFinanceListResponse>(
    reconciliationPath(workspaceId),
    { cache: 'no-store', query: apiQuery }
  );
}

export async function bulkLinkInventoryFinanceEntries(
  workspaceId: string,
  payload: InventoryFinanceBulkLinkPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  return client.json<InventoryFinanceBulkResult>(
    `${reconciliationPath(workspaceId)}/bulk-link`,
    { body: JSON.stringify(payload), method: 'POST' }
  );
}

export async function bulkUnlinkInventoryFinanceEntries(
  workspaceId: string,
  payload: InventoryFinanceBulkUnlinkPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  return client.json<InventoryFinanceBulkResult>(
    `${reconciliationPath(workspaceId)}/bulk-unlink`,
    { body: JSON.stringify(payload), method: 'POST' }
  );
}

export async function getInventoryFinanceMappings(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  return client.json<{ mappings: InventoryFinanceMapping[] }>(
    `${reconciliationPath(workspaceId)}/mappings`,
    { cache: 'no-store' }
  );
}

export async function putInventoryFinanceMappings(
  workspaceId: string,
  payload: PutInventoryFinanceMappingsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  return client.json<{ mappings: InventoryFinanceMapping[] }>(
    `${reconciliationPath(workspaceId)}/mappings`,
    { body: JSON.stringify(payload), method: 'PUT' }
  );
}

export async function syncInventoryFinanceProvider(
  workspaceId: string,
  payload: InventoryFinanceProviderSyncPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  return client.json<InventoryFinanceProviderSyncResult>(
    `${reconciliationPath(workspaceId)}/provider-sync`,
    { body: JSON.stringify(payload), method: 'POST' }
  );
}

export async function createInventoryFinanceManualAdjustment(
  workspaceId: string,
  payload: InventoryFinanceManualAdjustmentPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  return client.json<InventoryFinanceManualAdjustmentResult>(
    `${reconciliationPath(workspaceId)}/manual-adjustments`,
    { body: JSON.stringify(payload), method: 'POST' }
  );
}
