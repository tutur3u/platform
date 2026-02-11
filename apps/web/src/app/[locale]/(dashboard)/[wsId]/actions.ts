'use server';

import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { syncSubscriptionToDatabase } from '@/app/api/payment/webhooks/route';
import { getOrCreatePolarCustomer } from '@/utils/customer-helper';
import { createFreeSubscription } from '@/utils/subscription-helper';

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

export async function fetchWorkspaces() {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: workspaces, error } = await sbAdmin
    .from('workspaces')
    .select(
      'id, name, personal, avatar_url, logo_url, created_at, creator_id, workspace_members!inner(user_id), workspace_subscriptions!left(created_at, status, workspace_subscription_products(tier))'
    )
    .eq('workspace_members.user_id', user.id);

  if (error) return [];

  // Resolve the display label and avatar for personal workspaces using the current user's profile
  const [publicProfileRes, privateDetailsRes] = await Promise.all([
    supabase
      .from('users')
      .select('display_name, handle, avatar_url')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('user_private_details')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const publicProfile = publicProfileRes?.data as
    | {
        display_name: string | null;
        handle: string | null;
        avatar_url: string | null;
      }
    | null
    | undefined;
  const privateDetails = privateDetailsRes?.data as
    | { email: string | null }
    | null
    | undefined;

  const displayLabel: string | undefined =
    publicProfile?.display_name ||
    publicProfile?.handle ||
    privateDetails?.email ||
    undefined;

  const userAvatarUrl = publicProfile?.avatar_url || null;

  // For personal workspaces, override the name and avatar with the user's data
  return workspaces.map((ws) => {
    // Extract tier from workspace subscription - filter active subscriptions and sort by created_at
    const activeSubscriptions = ws.workspace_subscriptions
      .filter((sub: any) => sub?.status === 'active')
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    const tier =
      activeSubscriptions?.[0]?.workspace_subscription_products?.tier || null;

    const base = ws?.personal
      ? {
          ...ws,
          name: displayLabel || ws.name || 'Personal',
          avatar_url: userAvatarUrl || ws.avatar_url,
        }
      : ws;
    return {
      ...base,
      // Mark if current user is the creator for downstream UI
      created_by_me: base?.creator_id === user.id,
      // Include tier information
      tier,
    };
  });
}
