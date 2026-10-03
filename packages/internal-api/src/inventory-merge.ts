import { getInternalApiClient, type InternalApiClientOptions } from './client';

export type InventoryMergeKind = 'product' | 'warehouse';
export type InventoryMergeSelection = {
  kind: InventoryMergeKind;
  sourceId: string;
  targetId: string;
};
export type InventoryMergePreview = {
  version: string;
  source: {
    id: string;
    name: string | null;
    metadata: Record<string, unknown>;
  };
  target: {
    id: string;
    name: string | null;
    metadata: Record<string, unknown>;
  };
  stock: Array<{
    productId: string;
    warehouseId: string;
    unitId: string;
    sourceAmount: number | null;
    targetAmount: number | null;
    sourcePrice: number;
    targetPrice: number;
    sourceMinAmount: number;
    targetMinAmount: number;
    sourceRevenueShareBps: number;
    targetRevenueShareBps: number;
    sourceRevenueSharePartnerId: string | null;
    targetRevenueSharePartnerId: string | null;
    sourcePresent: boolean;
    targetPresent: boolean;
    conflict: boolean;
  }>;
  references: Array<{ table: string; count: number; historical?: boolean }>;
  blockers: string[];
};
export type InventoryMergePayload = InventoryMergeSelection & {
  version: string;
  metadata: 'source' | 'target';
  stockPolicy: 'source' | 'target';
};

const path = (wsId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(wsId)}/inventory/merges`;

export function previewInventoryMerge(
  wsId: string,
  selection: InventoryMergeSelection,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryMergePreview>(path(wsId), {
    cache: 'no-store',
    query: selection,
  });
}

export function applyInventoryMerge(
  wsId: string,
  payload: InventoryMergePayload,
  options?: InternalApiClientOptions
) {
  const headers = new Headers(options?.defaultHeaders);
  headers.set('Content-Type', 'application/json');
  return getInternalApiClient(options).json<{ merged: true; targetId: string }>(
    path(wsId),
    { method: 'POST', headers, body: JSON.stringify(payload) }
  );
}
