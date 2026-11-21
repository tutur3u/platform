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

const PARTICIPANT_TIER_TIMEOUT_MS = 2000;

/**
 * Stream quality follows the participant's own plan. A failed lookup falls
 * back to the free tier rather than blocking the join.
 */
export async function getParticipantStreamTier(
  accountId: string,
  timeoutMs = PARTICIPANT_TIER_TIMEOUT_MS
): Promise<MeetStreamTier> {
  // Bounded: a slow plan lookup degrades quality, never the join.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<MeetStreamTier>((resolve) => {
    timer = setTimeout(() => resolve('free'), timeoutMs);
  });
  try {
    return await Promise.race([
      getHostMeetingTier(accountId).then(meetStreamTierForProduct),
      timeout,
    ]);
  } catch {
    return 'free';
  } finally {
    clearTimeout(timer);
  }
}
