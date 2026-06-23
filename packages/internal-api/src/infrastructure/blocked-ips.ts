import { getInternalApiClient, type InternalApiClientOptions } from '../client';

export interface UnblockBlockedIpPayload {
  ipAddress: string;
  reason?: string;
}

export interface UnblockBlockedIpResponse {
  message: string;
}

export async function unblockBlockedIp(
  payload: UnblockBlockedIpPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<UnblockBlockedIpResponse>(
    '/api/v1/infrastructure/blocked-ips',
    {
      body: JSON.stringify({
        ip_address: payload.ipAddress,
        reason: payload.reason,
      }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'DELETE',
    }
  );
}
