'use server';

import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { fetchWorkspaces as _fetchWorkspaces } from '@tuturuuu/ui/lib/workspace-actions';
import { syncSubscriptionToDatabase } from '@/app/api/payment/webhooks/route';
import { getOrCreatePolarCustomer } from '@/utils/customer-helper';
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

  // Verify membership
  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError || !membership) throw new Error('Unauthorized');

  const isPolarConfigured =
    !!process.env.POLAR_WEBHOOK_SECRET && !!process.env.POLAR_ACCESS_TOKEN;

  if (!isPolarConfigured) return { success: true };

  const polar = createPolarClient();
  const sbAdmin = await createAdminClient();

  await getOrCreatePolarCustomer({
    polar,
    supabase: sbAdmin,
    wsId: wsId,
  });

  const result = await createFreeSubscription(polar, sbAdmin, wsId);

  if (result.status === 'error') {
    throw new Error(result.message);
  }

  if (result.status === 'created' || result.status === 'already_active') {
    // Manually sync to DB to ensure immediate availability
    await syncSubscriptionToDatabase(result.subscription);
  }

  return { success: true };
}
