'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { TransactionCategoryWithStats } from '@tuturuuu/types/primitives/TransactionCategory';

export interface TransactionCategoriesParams {
  q?: string;
  page?: number;
  pageSize?: number;
  type?: 'income' | 'expense' | 'all';
  minAmount?: number;
  maxAmount?: number;
}

export interface TransactionCategoriesResponse {
  data: TransactionCategoryWithStats[];
  count: number;
}

/**
 * Fetch workspace transaction categories with search, filter and pagination support.
 * Uses the existing API endpoint and applies client-side filtering.
 */
export function useTransactionCategories(
  wsId: string,
  params: TransactionCategoriesParams = {},
  options?: {
    enabled?: boolean;
    initialData?: TransactionCategoriesResponse;
  }
) {
  const {
    q = '',
    page = 1,
    pageSize = 10,
    type = 'all',
    minAmount,
    maxAmount,
  } = params;

  return useQuery({
    queryKey: [
      'transaction-categories',
      wsId,
      { q, page, pageSize, type, minAmount, maxAmount },
    ],
    queryFn: async (): Promise<TransactionCategoriesResponse> => {
      // Fetch all categories from the existing API endpoint
      const response = await fetch(
        `/api/workspaces/${wsId}/transactions/categories`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch transaction categories');
      }

      const allCategories: TransactionCategoryWithStats[] =
        await response.json();

      // Apply client-side filtering
      let filtered = allCategories;

      // Search filter
      if (q) {
        const searchLower = q.toLowerCase();
        filtered = filtered.filter((cat) =>
          cat.name?.toLowerCase().includes(searchLower)
        );
      }

      // Type filter
      if (type !== 'all') {
        if (type === 'income') {
          filtered = filtered.filter((cat) => !cat.is_expense);
        } else if (type === 'expense') {
          filtered = filtered.filter((cat) => cat.is_expense);
        }
      }

      // Amount filters
      if (minAmount !== undefined && !Number.isNaN(minAmount)) {
        filtered = filtered.filter((cat) => Number(cat.amount) >= minAmount);
      }

      if (maxAmount !== undefined && !Number.isNaN(maxAmount)) {
        filtered = filtered.filter((cat) => Number(cat.amount) <= maxAmount);
      }

      const count = filtered.length;

      // Pagination
      const start = (page - 1) * pageSize;
      const paginated = filtered.slice(start, start + pageSize);

      return { data: paginated, count };
    },
    enabled: options?.enabled !== false,
    initialData: options?.initialData,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
