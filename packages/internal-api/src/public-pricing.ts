import { getInternalApiClient, type InternalApiClientOptions } from './client';
export interface PublicWorkspacePrices {
  currency: 'usd';
  prices: Record<'plus' | 'pro', { monthly: number; annual: number }>;
}
export function getPublicWorkspacePrices(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<PublicWorkspacePrices>(
    '/api/v1/public/pricing',
    { credentials: 'omit' }
  );
}
