import type { Order } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { Database } from '@tuturuuu/types';
import { resolveWorkspaceOrderProduct } from '@/utils/polar-product-helper';

const ORDER_STATUS_MAP = {
  pending: 'pending',
  paid: 'paid',
  refunded: 'refunded',
  partially_refunded: 'partially_refunded',
} as const;

const BILLING_REASON_MAP = {
  purchase: 'purchase',
  subscription_create: 'subscription_create',
  subscription_cycle: 'subscription_cycle',
  subscription_update: 'subscription_update',
} as const;

type OrderStatus = Database['public']['Enums']['order_status'];
type BillingReason = Database['public']['Enums']['billing_reason'];

function mapOrderStatus(value: Order['status']): OrderStatus {
  const mapped = ORDER_STATUS_MAP[value as keyof typeof ORDER_STATUS_MAP];
  if (!mapped) {
    throw new Error(`Unsupported order status: ${String(value)}`);
  }
  return mapped;
}

function mapBillingReason(value: Order['billingReason']): BillingReason | null {
  if (!value) return null;
  const mapped = BILLING_REASON_MAP[value as keyof typeof BILLING_REASON_MAP];
  if (!mapped) {
    throw new Error(`Unsupported billing reason: ${String(value)}`);
  }
  return mapped;
}

export async function syncOrderToDatabase(
  supabase: TypedSupabaseClient,
  order: Order
) {
  const wsId = order.metadata?.wsId;

  if (!wsId || typeof wsId !== 'string') {
    console.error('Order sync error: Workspace ID not found.');
    throw new Error('Workspace ID not found.');
  }

  const productResolution = await resolveWorkspaceOrderProduct(
    supabase,
    order.productId
  );

  const orderData = {
    ws_id: wsId,
    polar_order_id: order.id,
    status: mapOrderStatus(order.status),
    polar_subscription_id: order.subscriptionId,
    product_id: productResolution.productId,
    credit_pack_id: productResolution.creditPackId,
    product_kind: productResolution.productKind,
    total_amount: order.totalAmount,
    currency: order.currency,
    billing_reason: mapBillingReason(order.billingReason),
    created_at: order.createdAt.toISOString(),
    updated_at: order.modifiedAt ? order.modifiedAt.toISOString() : null,
  };

  const { error: dbError } = await supabase
    .from('workspace_orders')
    .upsert([orderData], {
      onConflict: 'polar_order_id',
      ignoreDuplicates: false,
    });

  if (dbError) {
    throw new Error(`Order upsert error: ${dbError.message}`);
  }

  return orderData;
}
