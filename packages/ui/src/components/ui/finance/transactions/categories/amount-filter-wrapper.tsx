'use client';

import { AmountRangeFilter } from '@tuturuuu/ui/finance/transactions/categories/amount-filter';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export function AmountFilterWrapper() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Get current amount range from search params
  const minAmount = searchParams.get('minAmount') || undefined;
  const maxAmount = searchParams.get('maxAmount') || undefined;

  // Handle amount range filter changes
  const handleAmountRangeChange = useCallback(
    (min: string | undefined, max: string | undefined) => {
      const params = new URLSearchParams(searchParams);

      // Remove existing amount params
      params.delete('minAmount');
      params.delete('maxAmount');

      // Add new amount params if provided
      if (min) {
        params.set('minAmount', min);
      }
      if (max) {
        params.set('maxAmount', max);
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
    <AmountRangeFilter
      minAmount={minAmount}
      maxAmount={maxAmount}
      onAmountRangeChange={handleAmountRangeChange}
    />
  );
}
