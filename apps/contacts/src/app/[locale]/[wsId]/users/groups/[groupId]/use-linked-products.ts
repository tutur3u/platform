'use client';

import { useQuery } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

export interface LinkedProduct {
  id: string;
  name: string | null;
  description: string | null;
  warehouse_id?: string | null;
  unit_id?: string | null;
}

export interface WorkspaceProduct {
  id: string;
  name: string | null;
  description: string | null;
  manufacturer: string | null;
  category_id: string;
  inventory_products: Array<{
    unit_id: string;
    warehouse_id: string;
    inventory_units: {
      id: string;
      name: string | null;
    } | null;
    inventory_warehouses: {
      id: string;
      name: string | null;
    } | null;
  }>;
}

export interface WarehouseOption {
  id: string;
  name: string | null;
}

export const useProducts = (wsId: string) => {
  const t = useTranslations();
  return useQuery({
    queryKey: ['products', wsId],
    // Workspace-wide catalog; cache across group navigations.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/products/options`,
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        toast(t('ws-groups.failed_to_fetch_available_products'));
        return [];
      }

      const payload = (await response.json()) as {
        data?: WorkspaceProduct[];
      };
      return payload.data ?? [];
    },
  });
};

export const useWarehouses = (wsId: string, enabled = true) => {
  const t = useTranslations();
  return useQuery({
    queryKey: ['warehouses', wsId],
    // Only used as a name fallback inside the add/edit dialogs; fetch lazily.
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/product-warehouses`,
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        toast(t('ws-groups.failed_to_fetch_warehouses'));
        return [];
      }

      return (await response.json()) as WarehouseOption[];
    },
  });
};

// --- Pure inventory-resolution helpers (shared by the client + dialogs) ---

export function getAvailableWarehouses(
  products: WorkspaceProduct[] | undefined,
  productId: string
) {
  const product = products?.find((p) => p.id === productId);
  const inventory = product?.inventory_products ?? [];
  const seen = new Set<string>();

  return inventory.filter((item) => {
    if (!item.warehouse_id || seen.has(item.warehouse_id)) {
      return false;
    }
    seen.add(item.warehouse_id);
    return true;
  });
}

export function getAvailableUnits(
  products: WorkspaceProduct[] | undefined,
  productId: string,
  warehouseId: string
) {
  const product = products?.find((p) => p.id === productId);
  const list = product?.inventory_products || [];
  if (!warehouseId) return [] as WorkspaceProduct['inventory_products'];
  return list.filter((ip) => ip.warehouse_id === warehouseId);
}

export function getWarehouseName(
  products: WorkspaceProduct[] | undefined,
  warehouses: WarehouseOption[] | undefined,
  productId?: string,
  warehouseId?: string | null
) {
  if (!warehouseId) return null;
  const productWarehouse = productId
    ? getAvailableWarehouses(products, productId).find(
        (item) => item.warehouse_id === warehouseId
      )?.inventory_warehouses?.name
    : null;
  if (productWarehouse) return productWarehouse;
  const wh = (warehouses ?? []).find((w) => w.id === warehouseId);
  return wh?.name ?? null;
}

export function getUnitName(
  products: WorkspaceProduct[] | undefined,
  productId?: string,
  warehouseId?: string | null,
  unitId?: string | null
) {
  if (!productId || !warehouseId || !unitId) return null;
  const unit = getAvailableUnits(products, productId, warehouseId).find(
    (u) => u.unit_id === unitId
  );
  return unit?.inventory_units?.name ?? null;
}
