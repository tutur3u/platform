import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  passwordRequiresReset,
} from '@tuturuuu/utils/crypto';
import { normalizeMeetPlanId } from '@tuturuuu/utils/meet-guest-session';
import { z } from 'zod';

export const guestPasswordResetSchema = z
  .object({
    planId: z.string().transform(normalizeMeetPlanId).pipe(z.uuid()),
    guestName: z.string().min(1).max(255),
    password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  })
  .strict();

/** A verified framework actor is injected; request payloads cannot choose it. */
export async function resetMeetGuestPassword({
  client,
  actorUserId,
  input,
}: {
  client: TypedSupabaseClient;
  actorUserId: string | null | undefined;
  input: unknown;
}) {
  if (!actorUserId) return { error: 'UNAUTHORIZED' as const };
  const parsed = guestPasswordResetSchema.safeParse(input);
  if (!parsed.success) return { error: 'INVALID_REQUEST' as const };
  const { planId, guestName, password } = parsed.data;
  try {
    const { data: plan, error: planError } = await client
      .from('meet_together_plans')
      .select('creator_id, ws_id')
      .eq('id', planId)
      .maybeSingle();
    if (planError) return { error: 'RESET_FAILED' as const };
    if (!plan || plan.creator_id !== actorUserId)
      return { error: 'FORBIDDEN' as const };

    if (plan.ws_id) {
      const { data: membership, error: membershipError } = await client
        .from('workspace_members')
        .select('type')
        .eq('ws_id', plan.ws_id)
        .eq('user_id', actorUserId)
        .maybeSingle();
      if (membershipError) return { error: 'RESET_FAILED' as const };
      if (membership?.type !== 'MEMBER') return { error: 'FORBIDDEN' as const };
    }

    const { data: guest, error: guestError } = await client
      .from('meet_together_guests')
      .select('id, password_hash')
      .eq('plan_id', planId)
      .eq('name', guestName)
      .maybeSingle();
    if (guestError) return { error: 'RESET_FAILED' as const };
    if (!guest || !passwordRequiresReset(guest.password_hash)) {
      return { error: 'RESET_NOT_REQUIRED' as const };
    }

    const { data: updated, error } = await client
      .from('meet_together_guests')
      .update({
        password_hash: await hashPassword(password),
        password_salt: '',
      })
      .eq('plan_id', planId)
      .eq('id', guest.id)
      .eq('password_hash', guest.password_hash)
      .select('id')
      .maybeSingle();
    if (error || !updated) return { error: 'RESET_FAILED' as const };
    return { data: { success: true as const } };
  } catch {
    return { error: 'RESET_FAILED' as const };
  }
}
