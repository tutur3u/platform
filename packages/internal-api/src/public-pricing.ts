import { getInternalApiClient, type InternalApiClientOptions } from './client';
export interface PublicWorkspaceReferenceRates {
  revision: string;
  rates: readonly {
    modelId: string;
    multiplierBasisPoints: number;
    exampleCredits: number;
    exampleInputTokens: number;
    exampleOutputTokens: number;
  }[];
}
export interface PublicWorkspacePrices {
  currency: 'usd';
  referenceRates?: PublicWorkspaceReferenceRates | null;
  vndPrices?: Record<
    'plus' | 'pro' | 'max' | 'ultra',
    { monthly: number; annual: number }
  >;
  prices: Record<'plus' | 'pro', { monthly: number; annual: number }> &
    Partial<Record<'max' | 'ultra', { monthly: number; annual: number }>>;
}
export function getPublicWorkspacePrices(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<PublicWorkspacePrices>(
    '/api/v1/public/pricing',
    { credentials: 'omit' }
  );
}
