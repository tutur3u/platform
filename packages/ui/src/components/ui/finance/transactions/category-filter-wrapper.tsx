'use client';

import { CategoryFilter } from '@tuturuuu/ui/finance/transactions/category-filter';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useCallback } from 'react';

interface CategoryFilterWrapperProps {
  wsId: string;
}

export function CategoryFilterWrapper({ wsId }: CategoryFilterWrapperProps) {
  const [currentCategoryIds, setCategoryIds] = useQueryState(
    'categoryIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );
  const [, setPage] = useQueryState('page', { shallow: true });

  // Handle category filter changes
  const handleCategoriesChange = useCallback(
    async (categoryIds: string[]) => {
      await setCategoryIds(categoryIds.length > 0 ? categoryIds : []);
      await setPage('1');
    },
    [setCategoryIds, setPage]
  );

  return (
    <CategoryFilter
      wsId={wsId}
      selectedCategoryIds={currentCategoryIds}
      onCategoriesChange={handleCategoriesChange}
    />
  );
}
