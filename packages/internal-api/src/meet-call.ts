import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import { type SignedUploadPayload, uploadFileWithSignedUrl } from './storage';

/** Meet's Cloudflare-local refresh also supports invited guests outside a workspace. */
export function createMeetCallRealtimeToken(
  meetingId: string,
  options?: InternalApiClientOptions,
  device?: { deviceId: string; joinMode?: 'switch' | 'additional' }
) {
  return getInternalApiClient(options).json<
    | {
        requiresDeviceChoice: true;
        otherDeviceCount: number;
        token?: never;
        realtimeUrl?: never;
      }
    | { requiresDeviceChoice?: false; token: string; realtimeUrl: string }
  >(`/api/meet-call/${encodePathSegment(meetingId)}/token`, {
    method: 'POST',
    body: device ? JSON.stringify(device) : undefined,
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

export function askMeetAssistant(meetingId: string, messageId: string) {
  return getInternalApiClient().json<{ ok: boolean }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/assistant`,
    { method: 'POST', body: JSON.stringify({ messageId }) }
  );
}
export function uploadMeetChatFile(meetingId: string, file: File) {
  const form = new FormData();
  form.set('file', file);
  return getInternalApiClient().json<{
    id: string;
    name: string;
    size: number;
    contentType: string;
  }>(`/api/meet-call/${encodePathSegment(meetingId)}/files`, {
    method: 'POST',
    body: form,
  });
}
export function readMeetChatFile(meetingId: string, id: string) {
  return getInternalApiClient().json<{
    url: string;
    name: string;
    size: number;
    contentType: string;
  }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/files?id=${encodeURIComponent(id)}`,
    { cache: 'no-store' }
  );
}
export async function uploadMeetRoomRecording(
  meetingId: string,
  sessionId: string,
  blob: Blob
) {
  const contentType = blob.type.split(';')[0] || 'video/webm';
  const body = JSON.stringify({ sessionId, size: blob.size, contentType });
  const endpoint = `/api/meet-call/${encodePathSegment(meetingId)}/recording`;
  const target = await getInternalApiClient().json<{
    upload?: SignedUploadPayload;
    alreadyUploaded?: boolean;
    alreadySaved?: boolean;
  }>(endpoint, { method: 'POST', body });
  if (target.alreadySaved) return { ok: true };
  if (target.upload) {
    const file = new File(
      [blob],
      `recording.${contentType.includes('mp4') ? 'mp4' : 'webm'}`,
      { type: contentType }
    );
    await uploadFileWithSignedUrl(file, target.upload, fetch);
  } else if (!target.alreadyUploaded)
    throw new Error('Recording upload is unavailable');
  return getInternalApiClient().json<{ ok: boolean }>(endpoint, {
    method: 'PUT',
    body,
  });
}
export function readMeetRecordings(meetingId: string) {
  return getInternalApiClient().json<{
    recordings: Array<{
      sessionId: string;
      startedAt: string;
      endedAt?: string;
      status: string;
    }>;
  }>(`/api/meet-call/${encodePathSegment(meetingId)}/recording`, {
    cache: 'no-store',
  });
}
export function readMeetRecording(meetingId: string, sessionId: string) {
  return getInternalApiClient().json<{ url: string }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/recording?sessionId=${encodeURIComponent(sessionId)}`,
    { cache: 'no-store' }
  );
}

export function getMeetRoomCosts(meetingId: string) {
  return getInternalApiClient().json<{
    cloudflare: null | {
      receivedBytes: number;
      devices: number;
      reportingDevices: number;
      limitedReports?: number;
      webSocketMessages: number;
      httpRequests: number;
      storageWrites: number;
      sfuEgressUsd: number;
      durableRequestsUsd: number;
      pricingDate: string;
    };
    miraRequests: number;
    miraCostUsd: number;
    miraUnpriced: number;
  }>(`/api/meet-call/${encodePathSegment(meetingId)}/costs`, {
    cache: 'no-store',
  });
}

export function discardMeetChatFile(meetingId: string, id: string) {
  return getInternalApiClient().json<{ ok: boolean }>(
    `/api/meet-call/${encodePathSegment(meetingId)}/files`,
    {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    }
  );
}
