import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

/** Meet's Cloudflare-local refresh also supports invited guests outside a workspace. */
export function createMeetCallRealtimeToken(
  meetingId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    token: string;
    realtimeUrl: string;
  }>(`/api/meet-call/${encodePathSegment(meetingId)}/token`, {
    method: 'POST',
  });
}
