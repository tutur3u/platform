import { stripLegacyGuestSuffix } from '@tuturuuu/realtime/meet';

export interface MeetParticipantIdentityFlags {
  /** Anonymous guest without a Tuturuuu account (server-set). */
  guest?: boolean;
  /** Signed-in account outside the meeting's workspace (server-set). */
  external?: boolean;
}

export type MeetParticipantIdentity = 'guest' | 'external' | 'member';

/**
 * Labelling only. The identity comes from server-set flags, never from the
 * display name, so a self-chosen name cannot forge or hide it. Admission does
 * not change it: an admitted anonymous guest is still not signed in, and an
 * admitted outside account is still not a guest.
 */
export function meetParticipantIdentity(
  participant: MeetParticipantIdentityFlags
): MeetParticipantIdentity {
  if (participant.guest) return 'guest';
  if (participant.external) return 'external';
  return 'member';
}

/**
 * Rooms written before #8459 may still carry a " (guest)" name suffix. It is
 * removed only when a server flag shows the marker instead; a room that has
 * not set the flags keeps the suffix so the person stays marked.
 */
export function meetParticipantName(
  displayName: string,
  participant: MeetParticipantIdentityFlags
) {
  return meetParticipantIdentity(participant) === 'member'
    ? displayName
    : stripLegacyGuestSuffix(displayName);
}
