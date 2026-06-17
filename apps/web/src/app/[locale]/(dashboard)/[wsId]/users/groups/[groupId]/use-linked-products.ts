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
