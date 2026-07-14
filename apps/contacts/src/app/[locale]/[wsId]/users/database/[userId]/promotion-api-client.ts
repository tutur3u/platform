import {
  encodePathSegment,
  getInternalApiClient,
} from '@tuturuuu/internal-api/client';

const promotionsApi = getInternalApiClient();

export function linkWorkspaceUserPromotion(
  wsId: string,
  userId: string,
  promoId: string
) {
  return promotionsApi.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/users/${encodePathSegment(userId)}/linked-promotions`,
    {
      body: JSON.stringify({ promoId }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function unlinkWorkspaceUserPromotion(
  wsId: string,
  userId: string,
  promoId: string
) {
  return promotionsApi.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/users/${encodePathSegment(userId)}/linked-promotions`,
    {
      cache: 'no-store',
      method: 'DELETE',
      query: { promoId },
    }
  );
}
