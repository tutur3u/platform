'use client';

import { CategoryFilter } from '@tuturuuu/ui/finance/transactions/category-filter';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
import { useFilterReset } from './hooks/use-filter-reset';

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

  const [, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({
      shallow: true,
    })
  );

  // Handle category filter changes
  const handleCategoriesChange = useFilterReset(setCategoryIds, setPage);

  return (
    <CategoryFilter
      wsId={wsId}
      selectedCategoryIds={currentCategoryIds}
      onCategoriesChange={handleCategoriesChange}
    />
  );
}
