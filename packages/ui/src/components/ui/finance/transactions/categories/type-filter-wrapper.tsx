'use client';

import { TypeFilter } from '@tuturuuu/ui/finance/transactions/categories/type-filter';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export function TypeFilterWrapper() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Get current type from search params
  const currentType = searchParams.get('type') || undefined;

  // Handle type filter changes
  const handleTypeChange = useCallback(
    (type: string | undefined) => {
      const params = new URLSearchParams(searchParams);

      // Remove existing type param
      params.delete('type');

      // Add new type param if provided
      if (type) {
        params.set('type', type);
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
    <TypeFilter selectedType={currentType} onTypeChange={handleTypeChange} />
  );
}
