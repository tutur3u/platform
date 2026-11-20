import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { LiveBillingError } from '@/lib/live/billing';
import {
  LIVE_PAID_TIERS,
  resolveLiveEligibility,
  serializeLiveEligibility,
} from '@/lib/live/eligibility';

/** Billing details are per actor; no shared or browser cache may reuse them. */
const CACHE_HEADERS = { 'Cache-Control': 'no-store' };

/**
 * Shared pre-check for the Live start control. It runs the same decision as
 * the token routes without reserving a mint, credits or provider token.
 */
export async function liveEligibilityResponse({
  request,
  wsId,
  resolveBillingWsId,
}: {
  request: NextRequest;
  wsId: string;
  resolveBillingWsId: (args: {
    accessWsId: string;
    supabase: TypedSupabaseClient;
    userId: string;
  }) => Promise<string>;
}) {
  try {
    const supabase = await createClient(request);
    const { user } = await resolveAuthenticatedSessionUser(supabase);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const accessWsId = await normalizeWorkspaceId(wsId, supabase, request);
    const membership = await verifyWorkspaceMembershipType({
      supabase,
      userId: user.id,
      wsId: accessWsId,
    });
    if (membership.error === 'membership_lookup_failed') {
      return Response.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }
    if (!membership.ok) {
      return Response.json(
        {
          eligible: false,
          reason: 'role_not_allowed',
          tier: null,
          billing: null,
          params: { plans: LIVE_PAID_TIERS },
        },
        { headers: CACHE_HEADERS }
      );
    }
    const billingWsId = await resolveBillingWsId({
      accessWsId,
      supabase,
      userId: user.id,
    });
    const eligibility = await resolveLiveEligibility({
      userId: user.id,
      billingWsId,
    });
    return Response.json(serializeLiveEligibility(eligibility), {
      headers: CACHE_HEADERS,
    });
  } catch (error) {
    if (error instanceof LiveBillingError) {
      return Response.json(
        { code: error.code, error: 'Live billing is unavailable.' },
        { status: error.status }
      );
    }
    console.error('Live eligibility check failed');
    return Response.json(
      { error: 'Failed to check Live eligibility' },
      { status: 500 }
    );
  }
}
