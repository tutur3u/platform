import {
  CloudflareRealtimeClient,
  type RealtimeIdentity,
  type RealtimeJoin,
} from '@tuturuuu/realtime/channels';
import { getInternalApiClient, type InternalApiClientOptions } from './client';
export function createRealtimeClient(options?: InternalApiClientOptions) {
  const api = getInternalApiClient(options);
  return new CloudflareRealtimeClient(
    (topic) =>
      api.json<RealtimeJoin>('/api/v1/realtime/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      }),
    () => api.json<RealtimeIdentity>('/api/v1/realtime/session')
  );
}
export type {
  ChannelOptions,
  RealtimeChannel,
  RealtimeIdentity,
  RealtimePresenceState,
} from '@tuturuuu/realtime/channels';
export { createRealtimeClient as createClient };
