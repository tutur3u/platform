import 'server-only';
import {
  meetStreamTierForProduct,
  type MeetStreamTier,
} from '@tuturuuu/realtime/meet';
import {
  getHostMeetingTier,
  getHostMeetingDurationSeconds as resolveDuration,
} from '@tuturuuu/utils/meet-duration';
import { MeetCallAccessError } from './call-access';

export { meetingDurationSeconds } from '@tuturuuu/utils/meet-duration';
export async function getHostMeetingDurationSeconds(hostId: string) {
  try {
    return await resolveDuration(hostId);
  } catch {
    throw new MeetCallAccessError(503, 'Meeting entitlement lookup failed');
  }
}

/**
 * Stream quality follows the participant's own plan. A failed lookup falls
 * back to the free tier rather than blocking the join.
 */
export async function getParticipantStreamTier(
  accountId: string
): Promise<MeetStreamTier> {
  try {
    return meetStreamTierForProduct(await getHostMeetingTier(accountId));
  } catch {
    return 'free';
  }
}
