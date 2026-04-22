'use server';

import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { fetchWorkspaces as _fetchWorkspaces } from '@tuturuuu/ui/lib/workspace-actions';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { getOrCreatePolarCustomer } from '@/utils/customer-helper';
import { syncSubscriptionToDatabase } from '@/utils/polar-subscription-helper';
import { createFreeSubscription } from '@/utils/subscription-helper';

export async function fetchWorkspaces() {
  return _fetchWorkspaces();
}

export async function setupWorkspace(wsId: string) {
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

  const isPolarConfigured =
    !!process.env.POLAR_WEBHOOK_SECRET && !!process.env.POLAR_ACCESS_TOKEN;

  if (!isPolarConfigured) return { success: true };

  const polar = createPolarClient();
  const sbAdmin = await createAdminClient();

  await getOrCreatePolarCustomer({
    polar,
    supabase,
    wsId,
  });

  const result = await createFreeSubscription(polar, sbAdmin, wsId);

  if (result.status === 'error') {
    throw new Error(result.message);
  }

  if (result.status === 'created' || result.status === 'already_active') {
    // Manually sync to DB to ensure immediate availability
    await syncSubscriptionToDatabase(sbAdmin, result.subscription);
  }

  return { success: true };
}
