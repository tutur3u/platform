'use client';

import { useQuery } from '@tanstack/react-query';
import { getExchangeRates } from '@tuturuuu/internal-api/finance-exchange-rates';

export function useExchangeRates() {
  return useQuery({
    queryKey: ['exchange-rates', 'latest'],
    queryFn: () => getExchangeRates(),
    staleTime: 60 * 60 * 1000,
  });
}
