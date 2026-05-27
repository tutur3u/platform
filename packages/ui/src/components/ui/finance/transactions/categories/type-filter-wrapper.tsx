'use client';

import { TypeFilter } from '@tuturuuu/ui/finance/transactions/categories/type-filter';
import { parseAsInteger, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useCallback } from 'react';

const CATEGORY_TYPES = ['income', 'expense'] as const;

export function TypeFilterWrapper() {
  const [currentType, setType] = useQueryState(
    'type',
    parseAsStringLiteral(CATEGORY_TYPES).withOptions({
      shallow: true,
    })
  );

  const [, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({
      shallow: true,
    })
  );

  // Handle type filter changes
  const handleTypeChange = useCallback(
    async (type: string | undefined) => {
      await setType(type === 'income' || type === 'expense' ? type : null);
      await setPage(1);
    },
    [setType, setPage]
  );

  return (
    <TypeFilter
      selectedType={currentType ?? undefined}
      onTypeChange={handleTypeChange}
    />
  );
}
