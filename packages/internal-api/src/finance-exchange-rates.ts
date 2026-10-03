import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface ExchangeRate {
  base_currency: string;
  target_currency: string;
  rate: number;
  date: string;
}

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
