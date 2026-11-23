import { encodePathSegment, getInternalApiClient } from './client';

/** Room Mira state for the caller; counts only, never identities. */
export type RoomMiraConsent =
  | { available: false }
  | {
      available: true;
      version: string;
      /** The current host acceptance, shown to every participant. */
      acceptance: {
        revision: number;
        acceptorName: string;
        capabilities: Array<'chat' | 'captions' | 'notes'>;
      } | null;
      /** The caller's choice for the current acceptance; null is off. */
      choice: 'on' | 'off' | null;
      /** An opt-out waiting for already-admitted sends to settle. */
      pausing: boolean;
      /** The caller may send a room Mira request now. */
      ready: boolean;
      /** The caller is the host or a co-host present in the meeting. */
      canAccept: boolean;
      status: { active: boolean; included: number; admitted: number };
      /** Workspace default for the consent tick box. */
      boxTickedByDefault: boolean;
    };

export type RoomMiraChoiceInput = {
  choice: 'on' | 'off';
  version: string;
  acceptanceRevision: number;
  source: 'join' | 'confirm' | 'toggle';
  /** SHA-256 hex of the exact notice text shown. */
  textHash: string;
  locale: string;
};

const roomMiraPath = (meetingId: string) =>
  `/api/meet-call/${encodePathSegment(meetingId)}/mira-room`;

function postRoomMira(meetingId: string, body: unknown) {
  return getInternalApiClient().json<RoomMiraConsent>(roomMiraPath(meetingId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function readRoomMiraConsent(meetingId: string) {
  return getInternalApiClient().json<RoomMiraConsent>(roomMiraPath(meetingId), {
    cache: 'no-store',
  });
}

export function setRoomMiraChoice(
  meetingId: string,
  input: RoomMiraChoiceInput
) {
  return postRoomMira(meetingId, { action: 'choice', ...input });
}

/**
 * Turns room Mira on for the meeting as the host or a co-host, confirming the
 * audience is 18 or older. A later call with more capabilities is a new
 * acceptance that asks everyone to confirm again.
 */
export function acceptRoomMira(
  meetingId: string,
  capabilities: Array<'chat' | 'captions' | 'notes'>
) {
  return postRoomMira(meetingId, {
    action: 'accept',
    capabilities,
    audienceAdultConfirmed: true,
  });
}

export function turnOffRoomMira(meetingId: string) {
  return postRoomMira(meetingId, { action: 'end' });
}

/** Any participant may report that someone under 18 is present. */
export function reportRoomMiraMinor(meetingId: string) {
  return postRoomMira(meetingId, { action: 'report_minor' });
}
