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

/** Persist only the title; leave meeting time and calendar metadata intact. */
export function updateMeetCallTitle(meetingId: string, name: string) {
  return getInternalApiClient().json<{ name: string }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/title`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }
  );
}

export function getMeetCallRoomState(meetingId: string) {
  return getInternalApiClient().json<{ ended: boolean; canReadNotes: boolean }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/state`,
    { cache: 'no-store' }
  );
}
