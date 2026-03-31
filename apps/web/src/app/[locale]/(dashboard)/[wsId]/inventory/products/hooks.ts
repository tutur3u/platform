import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Product } from '@tuturuuu/types/primitives/Product';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';

export const productStatusValues = ['active', 'archived', 'all'] as const;
export type ProductStatusFilter = (typeof productStatusValues)[number];

export interface ProductsParams {
  categoryId?: string;
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
    q = '',
    page = 1,
    pageSize = 10,
    status = 'active',
    sortBy,
    sortOrder,
  } = params;

  const searchParams = new URLSearchParams();

  if (categoryId) searchParams.set('categoryId', categoryId);
  if (q) searchParams.set('q', q);
  searchParams.set('page', String(page));
  searchParams.set('pageSize', String(pageSize));
  searchParams.set('status', status);
  if (sortBy) searchParams.set('sortBy', sortBy);
  if (sortOrder) searchParams.set('sortOrder', sortOrder);

  const response = await fetch(
    `/api/v1/workspaces/${wsId}/inventory/products?${searchParams.toString()}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch workspace products');
  }

  const json = await response.json();
  return json as ProductsResponse;
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
      { categoryId, q, page, pageSize, status, sortBy, sortOrder },
    ],
    queryFn: () =>
      fetchWorkspaceProducts(wsId, {
        categoryId,
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
      const response = await fetch(`/api/v1/workspaces/${wsId}/product-units`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch product units');
      }

      const json = await response.json();
      return json as ProductUnit[];
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
