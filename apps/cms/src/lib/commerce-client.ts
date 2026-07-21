import { getInternalApiClient } from '@tuturuuu/internal-api/client';

export interface CmsCommerceOverview {
  collected: number;
  orders: number;
  revenue: number;
}

export interface CmsCommerceInsights {
  hasStorefront: boolean;
  outOfStock: number;
  storefrontPublished: boolean;
  totalProducts: number;
  unlisted: number;
}

export function getCmsCommerceOverview(workspaceId: string) {
  return getInternalApiClient().json<CmsCommerceOverview>(
    '/api/v1/commerce/overview',
    {
      cache: 'no-store',
      query: { wsId: workspaceId },
    }
  );
}

export function getCmsCommerceInsights(workspaceId: string) {
  return getInternalApiClient().json<CmsCommerceInsights>(
    '/api/v1/commerce/insights',
    {
      cache: 'no-store',
      query: { wsId: workspaceId },
    }
  );
}
