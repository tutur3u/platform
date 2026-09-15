import 'server-only';
import { canCreateOnlineMeeting } from './meet-creation-policy';
import { getHostMeetingTier } from './meet-duration';

/** Pass only the current auth.admin.getUserById result, never handoff/profile metadata. */
export async function canVerifiedAccountHostMeeting(
  accountId: string,
  identity:
    | { email?: string | null; email_confirmed_at?: string | null }
    | null
    | undefined
) {
  if (!identity?.email_confirmed_at || !identity.email) return false;
  if (canCreateOnlineMeeting(identity.email)) return true;
  return canCreateOnlineMeeting(
    identity.email,
    await getHostMeetingTier(accountId)
  );
}
