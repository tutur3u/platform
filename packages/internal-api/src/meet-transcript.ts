import { encodePathSegment, getInternalApiClient } from './client';

/** Why the meeting transcript and notes cannot run. */
export type MeetTranscriptUnavailableReason =
  | 'disabled'
  | 'workspace'
  | 'audience'
  | 'error';

export type MeetTranscriptConsent =
  | { available: false; reason?: MeetTranscriptUnavailableReason }
  | {
      available: true;
      version: string;
      choice: 'allow' | 'decline' | null;
      fence: {
        ready: boolean;
        pending: number;
        declined: number;
        admitted: number;
      };
      /** The host's transcript session is running. */
      active: boolean;
      activeSince: number | null;
    };

const consentPath = (meetingId: string) =>
  `/api/meet-call/${encodePathSegment(meetingId)}/transcript-consent`;

export function readMeetTranscriptConsent(meetingId: string) {
  return getInternalApiClient().json<MeetTranscriptConsent>(
    consentPath(meetingId),
    { cache: 'no-store' }
  );
}

export function setMeetTranscriptChoice(
  meetingId: string,
  choice: 'allow' | 'decline',
  version: string
) {
  return getInternalApiClient().json<MeetTranscriptConsent>(
    consentPath(meetingId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice, version }),
    }
  );
}
