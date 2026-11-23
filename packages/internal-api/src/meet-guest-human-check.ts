import { encodePathSegment, getInternalApiClient } from './client';

/** A jigsaw puzzle for a guest whose Turnstile check cannot load. */
export function createMeetGuestHumanCheck(meetingId: string) {
  return getInternalApiClient().json<{
    token: string;
    background: string;
    piece: string;
    pieceY: number;
    width: number;
    height: number;
    pieceSize: number;
    expiresAt: number;
  }>(`/api/meet-call/${encodePathSegment(meetingId)}/guest/human-check`, {
    method: 'POST',
    body: '{}',
  });
}

/** Checks one puzzle placement; a pass carries a single-use join token. */
export function verifyMeetGuestHumanCheck(
  meetingId: string,
  input: {
    token: string;
    x: number;
    mode: 'pointer' | 'keyboard';
    trajectory: { t: number; x: number; y: number }[];
  }
) {
  return getInternalApiClient().json<
    | { ok: true; passToken: string; expiresAt: number }
    | { ok: false; retry: boolean }
  >(`/api/meet-call/${encodePathSegment(meetingId)}/guest/human-check/verify`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
