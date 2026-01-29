'use client';

import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { transactionCategoryColumns } from '@tuturuuu/ui/finance/transactions/categories/columns';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback } from 'react';

interface CategoriesDataTableProps {
  wsId: string;
  data: TransactionCategory[];
  count: number;
  filters?: ReactNode[];
  currency?: string;
}

export function CategoriesDataTable({
  wsId,
  data,
  count,
  filters,
  currency = 'USD',
}: CategoriesDataTableProps) {
  const router = useRouter();

  const handleRowClick = useCallback(
    (row: TransactionCategory) => {
      // Navigate to transactions page with category filter
      router.push(`/${wsId}/finance/transactions?categoryIds=${row.id}`);
    },
    [router, wsId]
  );

  return (
    <CustomDataTable
      data={data}
      columnGenerator={transactionCategoryColumns}
      extraData={{ currency }}
      filters={filters}
      namespace="transaction-category-data-table"
      count={count}
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
      onRowClick={handleRowClick}
    />
  );
}
