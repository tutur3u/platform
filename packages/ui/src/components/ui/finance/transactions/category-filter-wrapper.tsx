'use client';

import { CategoryFilter } from '@tuturuuu/ui/finance/transactions/category-filter';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface CategoryFilterWrapperProps {
  wsId: string;
}

export function CategoryFilterWrapper({ wsId }: CategoryFilterWrapperProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Get current category IDs from search params
  const currentCategoryIds = searchParams.getAll('categoryIds');

  // Handle category filter changes
  const handleCategoriesChange = useCallback(
    (categoryIds: string[]) => {
      const params = new URLSearchParams(searchParams);

      // Remove all existing categoryIds params
      params.delete('categoryIds');

      // Add new categoryIds params
      if (categoryIds.length > 0) {
        categoryIds.forEach((categoryId) => {
          params.append('categoryIds', categoryId);
        });
      }

      // Reset to first page when filtering
      params.set('page', '1');

      const newUrl = `${pathname}?${params.toString()}`;
      router.push(newUrl);
      router.refresh();
    },
    [router, searchParams, pathname]
  );

  return (
    <CategoryFilter
      wsId={wsId}
      selectedCategoryIds={currentCategoryIds}
      onCategoriesChange={handleCategoriesChange}
    />
  );
}
