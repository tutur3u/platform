import { getInternalApiClient, type InternalApiClientOptions } from './client';

export type InventoryPrice = {
  id: string;
  product_id: string;
  unit_id: string;
  warehouse_id: string;
  period_id: string;
  currency: string;
  price: number;
  valid_from: string;
  valid_to: string | null;
};

export type InventoryPricePayload = {
  product_id: string;
  unit_id: string;
  warehouse_id: string;
  price: number;
  starts_on: string;
  ends_on?: string | null;
};

export function listInventoryPrices(
  wsId: string,
  periodId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventoryPrice[];
    as_of: string;
  }>(
    `/api/v1/workspaces/${encodeURIComponent(wsId)}/inventory/sales-periods/${encodeURIComponent(periodId)}/prices`,
    { cache: 'no-store' }
  );
}

export function createInventoryPrice(
  wsId: string,
  periodId: string,
  payload: InventoryPricePayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryPrice }>(
    `/api/v1/workspaces/${encodeURIComponent(wsId)}/inventory/sales-periods/${encodeURIComponent(periodId)}/prices`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}
