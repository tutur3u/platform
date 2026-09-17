import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
export function listFinancePromotions(
  wsId: string,
  query: { q?: string; page?: number; pageSize?: number },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: ProductPromotion[];
    count: number;
  }>(`/api/v1/workspaces/${encodePathSegment(wsId)}/promotions`, {
    cache: 'no-store',
    query: { ...query, response: 'paginated' },
  });
}
