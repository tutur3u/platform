/** The room policy fields the meeting page already has for this viewer. */
export interface MeetingNotesPolicy {
  canReadNotes: boolean;
  ended: boolean;
  /** Present for host tokens only; `/room-state` omits it for everyone else. */
  settings?: {
    shareNotes?: boolean;
    shareNotesAfterMeeting?: boolean;
  };
}

export type NotesAccess = 'host' | 'reader';

/**
 * Which access copy a viewer the policy already allows should see. The room
 * returns share settings to hosts only, so a non-host reader's policy cannot
 * tell host sharing apart from the workspace-admin fallback in
 * `readMeetingRoomPolicy`; those readers get neutral copy instead of a
 * guessed reason. This only picks copy and never grants access.
 */
export function notesAccess({ isHost }: { isHost: boolean }): NotesAccess {
  return isHost ? 'host' : 'reader';
}
