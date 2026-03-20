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
