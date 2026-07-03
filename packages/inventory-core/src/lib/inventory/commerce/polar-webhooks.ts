import 'server-only';

import type { InventoryPolarEnvironment } from '@tuturuuu/internal-api/inventory';
import type { Checkout, Order } from '@tuturuuu/payment/polar';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { recordInventorySaleFinanceTransaction } from './finance';
import { updateCheckoutPolarState } from './polar-checkout';
import type { SupabaseErrorLike } from './polar-core';
import { assertInventoryPolarWorkspace } from './polar-errors';

function getInventoryMetadata(value: unknown, expectedWsId?: string) {
  if (!value || typeof value !== 'object') return null;

  const metadata = value as Record<string, unknown>;
  if (metadata.kind !== 'inventory_checkout') return null;

  const checkoutId = metadata.checkoutId;
  const wsId = metadata.wsId;

  if (typeof checkoutId !== 'string' || typeof wsId !== 'string') {
    return null;
  }

  assertInventoryPolarWorkspace({ actualWsId: wsId, expectedWsId });

  return {
    checkoutId,
    environment:
      metadata.environment === 'production' ? 'production' : 'sandbox',
    publicToken:
      typeof metadata.publicToken === 'string' ? metadata.publicToken : null,
    storefrontSlug:
      typeof metadata.storefrontSlug === 'string'
        ? metadata.storefrontSlug
        : null,
    wsId,
  } satisfies {
    checkoutId: string;
    environment: InventoryPolarEnvironment;
    publicToken: string | null;
    storefrontSlug: string | null;
    wsId: string;
  };
}

export function hasInventoryPolarMetadata(value: unknown) {
  return Boolean(getInventoryMetadata(value));
}

function mapCheckoutStatus(status: string) {
  if (status === 'expired') return 'expired';
  if (status === 'failed') return 'failed';
  if (status === 'confirmed' || status === 'succeeded') return 'paid';
  return 'checkout_created';
}

export async function syncInventoryPolarCheckout(
  checkout: Checkout,
  expectedWsId?: string
) {
  const metadata = getInventoryMetadata(checkout.metadata, expectedWsId);
  if (!metadata) return false;

  const polarStatus = mapCheckoutStatus(String(checkout.status));
  await updateCheckoutPolarState(metadata.checkoutId, metadata.wsId, {
    polar_checkout_id: checkout.id,
    polar_status: polarStatus,
  });

  if (polarStatus === 'expired' || polarStatus === 'failed') {
    const sbAdmin = await createAdminClient();
    const { error } = (await sbAdmin.schema('private').rpc(
      'release_inventory_checkout_session' as never,
      {
        p_checkout_id: metadata.checkoutId,
        p_ws_id: metadata.wsId,
      } as never
    )) as { error: SupabaseErrorLike };

    if (error) {
      throw new Error(
        error.message ?? 'Failed to release checkout reservation'
      );
    }
  }

  return true;
}

function mapOrderPolarStatus(status: string) {
  if (status === 'paid') return 'paid';
  if (status === 'pending') return 'pending';
  return 'failed';
}

export async function syncInventoryPolarOrder(
  order: Order,
  expectedWsId?: string
) {
  const metadata = getInventoryMetadata(order.metadata, expectedWsId);
  if (!metadata) return false;

  await updateCheckoutPolarState(metadata.checkoutId, metadata.wsId, {
    polar_order_id: order.id,
    polar_status: mapOrderPolarStatus(String(order.status)),
  });

  if (order.status === 'paid') {
    const sbAdmin = await createAdminClient();
    const { error } = (await sbAdmin.schema('private').rpc(
      'complete_inventory_checkout_session_payment' as never,
      {
        p_checkout_id: metadata.checkoutId,
        p_polar_order_id: order.id,
        p_ws_id: metadata.wsId,
      } as never
    )) as { error: SupabaseErrorLike };

    if (error) {
      throw new Error(error.message ?? 'Failed to complete inventory checkout');
    }

    // Book the sale revenue into the workspace finance ledger. Idempotent and
    // non-throwing, so a booking hiccup can never fail the payment webhook.
    await recordInventorySaleFinanceTransaction({
      checkoutId: metadata.checkoutId,
    });
  }

  return true;
}
