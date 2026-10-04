import { getInternalApiClient, type InternalApiClientOptions } from './client';
import type { InventorySalesPeriod } from './inventory';
export type InventorySeasonMergePair = { sourceId: string; targetId: string };
export type InventorySeasonMergePrice = {
  id: string;
  productId: string;
  productName: string;
  unitId: string;
  unitName: string;
  warehouseId: string;
  warehouseName: string;
  currency: string;
  price: number;
  validFrom: string;
  validTo: string | null;
};
export type InventorySeasonMergeConflict = {
  sourcePriceId: string;
  targetPriceId: string;
  productId: string;
  productName: string;
  unitName: string;
  warehouseName: string;
  sourcePrice: number;
  targetPrice: number;
  sourceCurrency: string;
  targetCurrency: string;
  sourceFrom: string;
  sourceTo: string | null;
  targetFrom: string;
  targetTo: string | null;
};
export type InventorySeasonMergePreview = {
  version: string;
  cutoff: string;
  expiresAt: string;
  page: number;
  source: Omit<InventorySalesPeriod, 'product_ids' | 'sale_count'>;
  target: Omit<InventorySalesPeriod, 'product_ids' | 'sale_count'>;
  sourceRules: { id: string; name: string }[];
  targetRules: { id: string; name: string }[];
  sourceRuleCount: number;
  targetRuleCount: number;
  sourceRuleConflictCount: number;
  targetRuleConflictCount: number;
  futurePrices: InventorySeasonMergePrice[];
  futurePriceCount: number;
  conflicts: InventorySeasonMergeConflict[];
  conflictCount: number;
  blockers: string[];
  hasMore: boolean;
  assignmentCount: number;
  historicalQuoteCount: number;
};
export type InventorySeasonMergePayload = InventorySeasonMergePair & {
  version: string;
  descriptionPolicy: 'source' | 'target';
  rulePolicy: 'source' | 'target';
  pricePolicy: 'block' | 'target';
};
const path = (wsId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(wsId)}/inventory/sales-periods/merges`;
export function previewInventorySeasonMerge(
  wsId: string,
  pair: InventorySeasonMergePair & { version?: string; page?: number },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventorySeasonMergePreview>(
    path(wsId),
    { method: 'GET', cache: 'no-store', query: pair }
  );
}
export function applyInventorySeasonMerge(
  wsId: string,
  payload: InventorySeasonMergePayload,
  options?: InternalApiClientOptions
) {
  const headers = new Headers(options?.defaultHeaders);
  headers.set('Content-Type', 'application/json');
  return getInternalApiClient(options).json<{
    merged: true;
    targetId: string;
    importedPriceCount: number;
  }>(path(wsId), { method: 'POST', headers, body: JSON.stringify(payload) });
}
