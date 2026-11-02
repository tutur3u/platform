/** The room policy fields the meeting page already has for this viewer. */
export interface MeetingNotesPolicy {
  canReadNotes: boolean;
  ended: boolean;
  settings?: {
    shareNotes?: boolean;
    shareNotesAfterMeeting?: boolean;
  };
}

export type NotesAccess = 'host' | 'shared' | 'workspace_admin';

/**
 * Why a viewer the policy already allows can read the notes. The room grants
 * participants access through the live share flag during a call and the
 * after-meeting flag once it ended (`canReadRoomNotes`); any other non-host
 * reader was admitted by the workspace-admin check in `readMeetingRoomPolicy`.
 * This only picks copy and never grants access.
 */
export function notesAccess({
  isHost,
  policy,
}: {
  isHost: boolean;
  policy: Pick<MeetingNotesPolicy, 'ended' | 'settings'>;
}): NotesAccess {
  if (isHost) return 'host';
  const shared = policy.ended
    ? policy.settings?.shareNotesAfterMeeting
    : policy.settings?.shareNotes;
  return shared ? 'shared' : 'workspace_admin';
}
