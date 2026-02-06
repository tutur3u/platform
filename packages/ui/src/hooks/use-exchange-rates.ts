'use client';

import { useQuery } from '@tanstack/react-query';
import type { ExchangeRate } from '@tuturuuu/utils/exchange-rates';

interface ExchangeRatesResponse {
  data: ExchangeRate[];
  date: string | null;
}

export function useExchangeRates() {
  return useQuery<ExchangeRatesResponse>({
    queryKey: ['exchange-rates', 'latest'],
    queryFn: async () => {
      const res = await fetch('/api/v1/exchange-rates');
      if (!res.ok) throw new Error('Failed to fetch exchange rates');
      return res.json();
    },
    staleTime: 60 * 60 * 1000, // 1 hour — rates update daily
  });
}
