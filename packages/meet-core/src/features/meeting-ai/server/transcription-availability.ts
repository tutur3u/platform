import 'server-only';

/** Why the meeting transcript and notes cannot run; shown to the viewer. */
export type MeetTranscriptUnavailableReason =
  /** A Tuturuuu deployment or security switch keeps it off everywhere. */
  | 'disabled'
  /** The workspace is not in the current rollout or is excluded. */
  | 'workspace'
  /** The workspace owner has not confirmed the 18+ audience setting. */
  | 'audience'
  /** The availability check itself failed; retrying can help. */
  | 'error';

export type MeetTranscriptAvailability =
  | { available: true }
  | { available: false; reason: MeetTranscriptUnavailableReason };

/**
 * Room-wide transcription mixes every participant's audio, so it needs the
 * all-participant consent fence on top of the Meet AI gate. It stays off for
 * every workspace until a reviewed release opens it.
 */
export async function readMeetTranscriptionAvailability(
  _wsId: string
): Promise<MeetTranscriptAvailability> {
  return { available: false, reason: 'disabled' };
}
