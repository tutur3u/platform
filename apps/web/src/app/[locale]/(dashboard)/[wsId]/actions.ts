'use server';

import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { cookies } from 'next/headers';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { isPolarWorkspaceSetupEnabled } from '@/lib/polar-config';
import { getOrCreatePolarCustomer } from '@/utils/customer-helper';
import { syncSubscriptionToDatabase } from '@/utils/polar-subscription-helper';
import { createFreeSubscription } from '@/utils/subscription-helper';
import {
  getWorkspaceSetupAttemptCookie,
  WORKSPACE_SETUP_ATTEMPT_COOKIE_MAX_AGE,
} from './workspace-setup-cookie';

export interface SetupWorkspaceResult {
  success: boolean;
  /**
   * Whether the free subscription was actually provisioned in Polar + mirrored
   * to the database. `false` means the workspace is usable but Polar
   * provisioning was skipped/failed and should be reconciled later.
   */
  subscriptionProvisioned: boolean;
}

/**
 * Prepares a newly created workspace. Authentication and membership are
 * load-bearing and still throw, but Polar subscription provisioning is treated
 * as best-effort: a Polar outage, a missing free-tier product, or a sync hiccup
 * must never trap the user on the "Preparing Workspace" screen. When
 * provisioning fails we log it (the real reason is otherwise redacted by
 * Next.js in production) and still allow the user into the workspace; the
 * subscription is reconciled on a later load, by the Polar webhook, or by the
 * subscription-sync path.
 */
export async function setupWorkspace(
  wsId: string
): Promise<SetupWorkspaceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Unauthorized');

  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed' || !membership.ok) {
    throw new Error('Unauthorized');
  }

  // Record the attempt so the dashboard layout lets the user in even if Polar
  // provisioning stays degraded (workspace tier never resolves). Short-lived so
  // a genuine retry can still happen on a later visit.
  const cookieStore = await cookies();
  cookieStore.set(getWorkspaceSetupAttemptCookie(wsId), '1', {
    maxAge: WORKSPACE_SETUP_ATTEMPT_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
  });

  if (!isPolarWorkspaceSetupEnabled()) {
    return { success: true, subscriptionProvisioned: false };
  }

  try {
    const polar = createPolarClient();
    const sbAdmin = await createAdminClient();

    await getOrCreatePolarCustomer({
      polar,
      supabase,
      wsId,
    });

    const result = await createFreeSubscription(polar, sbAdmin, wsId);

    if (result.status === 'error') {
      serverLogger.warn(
        'Workspace free-subscription provisioning failed; allowing workspace entry',
        { wsId, reason: result.message }
      );
      return { success: true, subscriptionProvisioned: false };
    }

    // Manually sync to DB to ensure immediate availability.
    await syncSubscriptionToDatabase(sbAdmin, result.subscription);

    return { success: true, subscriptionProvisioned: true };
  } catch (error) {
    serverLogger.error(
      'Workspace Polar setup threw; allowing workspace entry',
      {
        wsId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    return { success: true, subscriptionProvisioned: false };
  }
}
