import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import 'server-only';
import { getHostMeetingTier } from './meet-duration';

const PAID_HOSTING_TIERS = ['PLUS', 'PRO', 'ENTERPRISE'];

/**
 * Server-only switch for opening Meet hosting to paid tiers. It fails closed:
 * only the exact value `true` enables it; unset, blank or anything else keeps
 * hosting limited to verified internal (staff) accounts.
 */
export function isMeetPaidTierHostingEnabled(
  value = process.env.MEET_PAID_TIER_HOSTING_ENABLED
) {
  return value === 'true';
}

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
  if (!isMeetPaidTierHostingEnabled()) return false;
  return PAID_HOSTING_TIERS.includes(await getHostMeetingTier(accountId));
}
