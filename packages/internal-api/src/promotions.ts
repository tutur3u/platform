import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface WorkspaceReferralSettingsPayload {
  referral_count_cap: number;
  referral_increment_percent: number;
  referral_promotion_id?: string | null;
  referral_reward_type: 'REFERRER' | 'RECEIVER' | 'BOTH';
}

export interface WorkspaceReferralSettings
  extends WorkspaceReferralSettingsPayload {
  id?: string;
  ws_id?: string;
}

export interface WorkspacePromotion {
  id: string;
  name: string | null;
  description?: string | null;
  code: string | null;
  value: number | null;
  use_ratio: boolean | null;
  promo_type?: string | null;
  max_uses?: number | null;
  current_uses?: number | null;
}

export interface WorkspacePromotionPayload {
  code: string;
  description?: string;
  max_uses?: number | null;
  name: string;
  unit?: 'percentage' | 'currency';
  value: number;
}

export interface CreatedWorkspacePromotion {
  id: string;
  name: string | null;
  code: string | null;
  value: number;
  use_ratio: boolean;
  max_uses: number | null;
  current_uses: number;
}

export interface WorkspacePromotionMutationResponse {
  data?: CreatedWorkspacePromotion;
  message: string;
}

export interface WorkspaceUserLinkedPromotion {
  promo_id: string | null;
  workspace_promotions?: WorkspacePromotion | null;
}

export interface WorkspaceUserReferralDiscount {
  promo_id: string | null;
  calculated_discount_value: number | null;
}

export async function listWorkspacePromotions(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspacePromotion[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/promotions`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWorkspacePromotion(
  workspaceId: string,
  payload: WorkspacePromotionPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspacePromotionMutationResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/promotions`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateWorkspacePromotion(
  workspaceId: string,
  promotionId: string,
  payload: WorkspacePromotionPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/promotions/${encodePathSegment(promotionId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function deleteWorkspacePromotion(
  workspaceId: string,
  promotionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/promotions/${encodePathSegment(promotionId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function listWorkspaceUserLinkedPromotions(
  workspaceId: string,
  userId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceUserLinkedPromotion[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/${encodePathSegment(userId)}/linked-promotions`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceUserReferralDiscounts(
  workspaceId: string,
  userId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceUserReferralDiscount[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/${encodePathSegment(userId)}/referral-discounts`,
    {
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceReferralSettings(
  workspaceId: string,
  payload: WorkspaceReferralSettingsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/promotions/referral-settings`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceReferralSettings(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: WorkspaceReferralSettings | null }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/promotions/referral-settings`,
    {
      cache: 'no-store',
    }
  );
}
