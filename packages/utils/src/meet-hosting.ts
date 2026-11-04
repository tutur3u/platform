import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import 'server-only';
import { getHostMeetingTier } from './meet-duration';

/** Pass only the current auth.admin.getUserById result, never handoff/profile metadata. */
export async function canVerifiedAccountHostMeeting(
  accountId: string,
  identity:
    | Parameters<typeof isVerifiedTuturuuuStaffSession>[0]
    | null
    | undefined
) {
  if (!identity?.email_confirmed_at || !identity.email) return false;
  if (isVerifiedTuturuuuStaffSession(identity)) return true;
  return ['PLUS', 'PRO', 'ENTERPRISE'].includes(
    await getHostMeetingTier(accountId)
  );
}
