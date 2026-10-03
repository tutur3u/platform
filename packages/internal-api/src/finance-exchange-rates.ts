import type { ExchangeRate } from '@tuturuuu/utils/exchange-rates';
import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface ExchangeRatesResponse {
  data: ExchangeRate[];
  date: string | null;
}

export function getExchangeRates(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<ExchangeRatesResponse>(
    '/api/v1/exchange-rates',
    { cache: 'no-store' }
  );
}
