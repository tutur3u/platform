import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { meetAiAvailable } from './workspace-gate';

/**
 * Default-deny gate for Meet AI writes that run through a room access object.
 * The workspace is the one the server resolved for the meeting. Reads stay open.
 */
export async function assertMeetAiRoom(access: { meeting: { ws_id: string } }) {
  if (!(await meetAiAvailable(access.meeting.ws_id)))
    throw new MeetCallAccessError(
      403,
      'Meeting AI is not available for this workspace'
    );
}
