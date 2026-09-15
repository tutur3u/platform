import 'server-only';
import { getHostMeetingDurationSeconds as resolveDuration } from '@tuturuuu/utils/meet-duration';
import { MeetCallAccessError } from './call-access';

export { meetingDurationSeconds } from '@tuturuuu/utils/meet-duration';
export async function getHostMeetingDurationSeconds(hostId: string) {
  try {
    return await resolveDuration(hostId);
  } catch {
    throw new MeetCallAccessError(503, 'Meeting entitlement lookup failed');
  }
}
