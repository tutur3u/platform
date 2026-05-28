import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  type InventoryManufacturer,
  listInventoryManufacturers,
  listInventoryProducts,
  listInventoryUnits,
} from '@tuturuuu/internal-api';
import type { Product } from '@tuturuuu/types/primitives/Product';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';

export const productStatusValues = ['active', 'archived', 'all'] as const;
export type ProductStatusFilter = (typeof productStatusValues)[number];

export interface ProductsParams {
  categoryId?: string;
  manufacturerId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  status?: ProductStatusFilter;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ProductsResponse {
  data: Product[];
  count: number;
}

export async function fetchWorkspaceProducts(
  wsId: string,
  params: ProductsParams = {}
): Promise<ProductsResponse> {
  const {
    categoryId,
    manufacturerId,
    q = '',
    page = 1,
    pageSize = 10,
    status = 'active',
    sortBy,
    sortOrder,
  } = params;

  const response = await listInventoryProducts(wsId, {
    categoryId,
    manufacturerId,
    q,
    page,
    pageSize,
    sortBy,
    sortOrder,
    status,
  });

  return response as ProductsResponse;
}

export function useWorkspaceProducts(
  wsId: string,
  params: ProductsParams = {},
  options?: {
    enabled?: boolean;
    initialData?: ProductsResponse;
  }
) {
  const {
    categoryId,
    manufacturerId,
    q = '',
    page = 1,
    pageSize = 10,
    status = 'active',
    sortBy,
    sortOrder,
  } = params;

  return useQuery({
    queryKey: [
      'workspace-products',
      wsId,
      {
        categoryId,
        manufacturerId,
        q,
        page,
        pageSize,
        status,
        sortBy,
        sortOrder,
      },
    ],
    queryFn: () =>
      fetchWorkspaceProducts(wsId, {
        categoryId,
        manufacturerId,
        q,
        page,
        pageSize,
        status,
        sortBy,
        sortOrder,
      }),
    enabled: options?.enabled !== false,
    initialData: options?.initialData,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useProductManufacturers(
  wsId: string,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['product-manufacturers', wsId],
    queryFn: async (): Promise<InventoryManufacturer[]> => {
      const response = await listInventoryManufacturers(wsId);
      return response.data;
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useWorkspaceProduct(
  wsId: string,
  productId?: string,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['workspace-product', wsId, productId],
    queryFn: async (): Promise<Product> => {
      if (!productId) throw new Error('Product ID is required');

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/products/${productId}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch product');
      }

      const json = await response.json();
      return json as Product;
    },
    enabled: options?.enabled !== false && !!productId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useProductCategories(
  wsId: string,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['product-categories', wsId],
    queryFn: async (): Promise<ProductCategory[]> => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/product-categories`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch product categories');
      }

      const json = await response.json();
      return json as ProductCategory[];
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useProductWarehouses(
  wsId: string,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['product-warehouses', wsId],
    queryFn: async (): Promise<ProductWarehouse[]> => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/product-warehouses`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch product warehouses');
      }

      const json = await response.json();
      return json as ProductWarehouse[];
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useProductUnits(
  wsId: string,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['product-units', wsId],
    queryFn: async (): Promise<ProductUnit[]> => {
      const units = await listInventoryUnits(wsId);
      return units as ProductUnit[];
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
