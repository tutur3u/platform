import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceProductTier } from '@tuturuuu/types';
import { extractTierFromSubscriptions } from './workspace-helper';
export class MeetDurationError extends Error {
  readonly status = 503;
}

export function meetingDurationSeconds(tier: string) {
  return (
    (tier === 'PLUS' ? 10 : tier === 'PRO' || tier === 'ENTERPRISE' ? 24 : 2) *
    3600
  );
}

/** Entitlements belong to the host's personal account, never the joining guest. */
export async function getHostMeetingTier(
  hostId: string
): Promise<WorkspaceProductTier> {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .from('workspaces')
    .select('id')
    .eq('creator_id', hostId)
    .eq('personal', true)
    .or('deleted.is.null,deleted.eq.false')
    .maybeSingle();
  if (error) throw new MeetDurationError('Meeting entitlement lookup failed');
  if (!data) return 'FREE';
  const subscriptions = await db
    .from('workspace_subscriptions')
    .select('created_at, status, product_id')
    .eq('ws_id', data.id)
    .eq('status', 'active');
  if (subscriptions.error)
    throw new MeetDurationError('Meeting entitlement lookup failed');
  const ids = [
    ...new Set(
      subscriptions.data
        .map((subscription) => subscription.product_id)
        .filter((id): id is string => !!id)
    ),
  ];
  if (!ids.length) return 'FREE';
  const products = await db
    .schema('private')
    .from('workspace_subscription_products')
    .select('id, tier')
    .in('id', ids);
  if (products.error)
    throw new MeetDurationError('Meeting entitlement lookup failed');
  const tiers = new Map(
    products.data.map((product) => [product.id, product.tier])
  );
  if (ids.some((id) => !tiers.get(id)))
    throw new MeetDurationError('Meeting entitlement product unavailable');
  const tier = extractTierFromSubscriptions(
    subscriptions.data.map((subscription) => ({
      ...subscription,
      product_tier: subscription.product_id
        ? (tiers.get(subscription.product_id) ?? null)
        : null,
    }))
  );

  return tier ?? 'FREE';
}

export async function getHostMeetingDurationSeconds(hostId: string) {
  return meetingDurationSeconds(await getHostMeetingTier(hostId));
}
