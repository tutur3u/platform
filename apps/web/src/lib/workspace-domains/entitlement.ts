import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { z } from 'zod';

/** Price shown for the custom-domain add-on (USD per domain per month). */
export const WORKSPACE_DOMAIN_ADDON_PRICE_USD = 10;

export const entitlementSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  source: z.enum(['paid_addon', 'staff_bypass']).nullable(),
  cap: z.number().int(),
  used: z.number().int(),
  total: z.number().int(),
  remaining: z.number().int(),
});

export type WorkspaceDomainEntitlement = z.infer<typeof entitlementSchema>;

export interface WorkspaceDomainActor {
  id: string;
  /**
   * isVerifiedTuturuuuStaffSession(user) with allowXwf = false, computed by
   * the route adapter from the current Auth user. The SQL policy applies the
   * same rule; both must agree before the staff bypass applies.
   */
  staffSession: boolean;
}

/**
 * Staff bypass identity: a current Auth user with a confirmed email in
 * exactly @tuturuuu.com (never xwf.tuturuuu.com or lookalike domains).
 */
export function isWorkspaceDomainStaffUser(
  user: Parameters<typeof isVerifiedTuturuuuStaffSession>[0]
) {
  return isVerifiedTuturuuuStaffSession(user, { allowXwf: false });
}

const DENIED = (reason: string): WorkspaceDomainEntitlement => ({
  allowed: false,
  reason,
  source: null,
  cap: 0,
  used: 0,
  total: 0,
  remaining: 0,
});

/**
 * Paid add-on checkout stays off until WORKSPACE_DOMAINS_BILLING_ENABLED is
 * `true`. While off, paid workspaces see the price as coming soon and only
 * the staff bypass can activate domains.
 */
export function isWorkspaceDomainsBillingEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return env.WORKSPACE_DOMAINS_BILLING_ENABLED === 'true';
}

/** Fails closed: any database error or unexpected shape denies. */
export async function readWorkspaceDomainEntitlement(
  admin: TypedSupabaseClient,
  wsId: string,
  actor: WorkspaceDomainActor
): Promise<WorkspaceDomainEntitlement> {
  const { data, error } = await admin
    .schema('private')
    .rpc('workspace_domain_entitlement', {
      p_ws_id: wsId,
      p_actor_id: actor.id,
    });
  if (error) {
    console.error('workspace-domains: entitlement lookup failed', {
      code: error.code,
      wsId,
    });
    return DENIED('unavailable');
  }
  const parsed = entitlementSchema.safeParse(data);
  if (!parsed.success) return DENIED('unavailable');
  const entitlement = parsed.data;
  if (entitlement.source === 'staff_bypass' && !actor.staffSession) {
    return { ...DENIED('staff_session_unverified'), cap: entitlement.cap };
  }
  return entitlement;
}

export async function isWorkspaceDomainsEnabled(admin: TypedSupabaseClient) {
  const { data, error } = await admin
    .schema('private')
    .from('workspace_domain_settings')
    .select('enabled')
    .maybeSingle();
  return !error && data?.enabled === true;
}

export async function isVerifiedStaffUser(
  admin: TypedSupabaseClient,
  userId: string | null
) {
  if (!userId) return false;
  const { data, error } = await admin.rpc('is_verified_tuturuuu_staff', {
    p_user_id: userId,
    p_allow_xwf: false,
  });
  return !error && data === true;
}
