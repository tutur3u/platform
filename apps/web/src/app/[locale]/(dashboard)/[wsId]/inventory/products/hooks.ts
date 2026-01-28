import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Product } from '@tuturuuu/types/primitives/Product';

export interface ProductsParams {
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ProductsResponse {
  data: Product[];
  count: number;
}

export function useWorkspaceProducts(
  wsId: string,
  params: ProductsParams = {},
  options?: {
    enabled?: boolean;
    initialData?: ProductsResponse;
  }
) {
  const { q = '', page = 1, pageSize = 10, sortBy, sortOrder } = params;

  return useQuery({
    queryKey: [
      'workspace-products',
      wsId,
      { q, page, pageSize, sortBy, sortOrder },
    ],
    queryFn: async (): Promise<ProductsResponse> => {
      const searchParams = new URLSearchParams();

      if (q) searchParams.set('q', q);
      searchParams.set('page', String(page));
      searchParams.set('pageSize', String(pageSize));
      if (sortBy) searchParams.set('sortBy', sortBy);
      if (sortOrder) searchParams.set('sortOrder', sortOrder);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/inventory/products?${searchParams.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch workspace products');
      }

      const json = await response.json();
      return json as ProductsResponse;
    },
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
        `/api/v1/workspaces/${wsId}/products/${productId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch product');
      }

      const json = await response.json();
      return json as Product;
    },
    enabled: options?.enabled !== false && !!productId,
  });
}
