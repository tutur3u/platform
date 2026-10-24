import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { verifyMeetGuestSession } from '@tuturuuu/utils/meet-guest-session';

/**
 * Resolves the guest behind a server-issued Meet guest session.
 *
 * The session must verify for this plan, match `expectedGuestId` when the
 * caller supplies one, and the guest row must still belong to the plan.
 * Stored password hashes are never accepted as a credential here.
 *
 * Kept outside the `'use server'` action modules so it is never exposed as a
 * callable server action.
 */
export async function resolveMeetGuestFromSession(
  sbAdmin: TypedSupabaseClient,
  planId: string,
  guestSession: string | null | undefined,
  expectedGuestId?: string | null
): Promise<{ id: string } | null> {
  const session = verifyMeetGuestSession(guestSession, planId);
  if (!session) return null;
  if (expectedGuestId && expectedGuestId !== session.guestId) return null;

  const { data: guest, error } = await sbAdmin
    .from('meet_together_guests')
    .select('id')
    .eq('plan_id', planId)
    .eq('id', session.guestId)
    .maybeSingle();

  if (error || !guest) return null;
  return { id: guest.id };
}
