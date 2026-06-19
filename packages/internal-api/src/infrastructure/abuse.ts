import { getInternalApiClient, type InternalApiClientOptions } from '../client';
import type {
  AbuseIntelligenceSnapshot,
  AbuseTrustOverrideResponse,
  CreateAbuseTrustOverridePayload,
  GetAbuseIntelligenceSnapshotParams,
  RevokeAbuseTrustOverridePayload,
} from './types';

export async function getAbuseIntelligenceSnapshot(
  params?: GetAbuseIntelligenceSnapshotParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();

  if (params?.limit != null) {
    searchParams.set('limit', String(params.limit));
  }

  if (params?.signalLimit != null) {
    searchParams.set('signalLimit', String(params.signalLimit));
  }

  return client.json<AbuseIntelligenceSnapshot>(
    `/api/v1/infrastructure/abuse-intelligence${
      searchParams.size > 0 ? `?${searchParams.toString()}` : ''
    }`,
    { cache: 'no-store' }
  );
}

export async function createAbuseTrustOverride(
  payload: CreateAbuseTrustOverridePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AbuseTrustOverrideResponse>(
    '/api/v1/infrastructure/abuse-intelligence',
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

export async function revokeAbuseTrustOverride(
  overrideId: string,
  payload: RevokeAbuseTrustOverridePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AbuseTrustOverrideResponse>(
    `/api/v1/infrastructure/abuse-intelligence/overrides/${encodeURIComponent(
      overrideId
    )}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export type * from './types';
