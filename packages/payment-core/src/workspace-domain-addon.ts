import type { Subscription } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';

const MAX_DOMAIN_ADDON_QUANTITY = 1000;

/** Domain units on an add-on subscription: Polar seats, else one unit. */
export function domainAddonQuantity(subscription: Subscription): number {
  const seats = subscription.seats;
  if (typeof seats === 'number' && Number.isSafeInteger(seats) && seats >= 0) {
    return Math.min(seats, MAX_DOMAIN_ADDON_QUANTITY);
  }
  return 1;
}

/**
 * Projects a custom-domain add-on subscription into
 * private.workspace_domain_addons. Older events never overwrite newer ones.
 * Entitlement reads this table only while paid add-ons are enabled.
 */
export async function upsertWorkspaceDomainAddon(
  supabase: TypedSupabaseClient,
  wsId: string,
  subscription: Subscription
) {
  const eventVersion = new Date(
    subscription.modifiedAt ?? subscription.createdAt
  ).toISOString();
  const domainAddonData = {
    polar_subscription_id: subscription.id,
    ws_id: wsId,
    polar_product_id: subscription.product.id,
    quantity: domainAddonQuantity(subscription),
    status: subscription.status,
    current_period_end: subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd).toISOString()
      : null,
    updated_at: eventVersion,
  };

  const addons = supabase.schema('private').from('workspace_domain_addons');
  const { data: existing, error: lookupError } = await addons
    .select('updated_at, ws_id')
    .eq('polar_subscription_id', subscription.id)
    .maybeSingle();
  if (lookupError) {
    throw new Error(`Domain add-on lookup error: ${lookupError.message}`);
  }
  if (existing && existing.ws_id !== wsId) {
    throw new Error('Domain add-on subscription changed workspace');
  }
  if (existing && existing.updated_at > eventVersion) {
    return { domainAddonData: null };
  }

  const { error } = await supabase
    .schema('private')
    .from('workspace_domain_addons')
    .upsert(domainAddonData, { onConflict: 'polar_subscription_id' });
  if (error) throw new Error(`Domain add-on upsert error: ${error.message}`);
  return { domainAddonData };
}
