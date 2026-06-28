import 'server-only';

import type {
  InventoryCheckoutSession,
  InventorySquareTerminalCheckoutStatus,
} from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  getCheckoutById,
  releaseCheckout,
} from '@/lib/inventory/commerce/checkouts';
import { recordInventorySaleFinanceTransaction } from '@/lib/inventory/commerce/finance';
import {
  cancelSquareTerminalCheckoutApi,
  createSquareOrderApi,
  createSquareTerminalCheckoutApi,
  toSquareMoney,
} from './client';
import { getInventorySquareTerminalContext } from './connection-store';
import { getPrivateAdmin, type SupabaseErrorLike } from './settings-store';
import type {
  SquareApiPayment,
  SquareApiTerminalCheckout,
  SquareTerminalCheckoutResult,
} from './types';

function mapTerminalStatus(
  status: string | null | undefined
): InventorySquareTerminalCheckoutStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'CANCELED':
      return 'canceled';
    case 'CANCELLED':
      return 'cancelled';
    case 'COMPLETED':
      return 'completed';
    case 'EXPIRED':
      return 'expired';
    case 'FAILED':
      return 'failed';
    case 'IN_PROGRESS':
      return 'in_progress';
    case 'PENDING':
      return 'pending';
    default:
      return 'checkout_created';
  }
}

function mapPaymentStatus(status: string | null | undefined) {
  return (status ?? '').toUpperCase() === 'COMPLETED' ? 'paid' : 'pending';
}

async function updateCheckoutSquareState(
  checkoutId: string,
  wsId: string,
  values: Record<string, unknown>
) {
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_checkout_sessions' as never)
    .update({
      ...values,
      checkout_provider: 'square_terminal',
      square_last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', checkoutId)
    .eq('ws_id', wsId)) as { error: SupabaseErrorLike };

  if (error) {
    throw new Error(error.message ?? 'Failed to update Square checkout state');
  }
}

function buildOrderPayload({
  checkout,
  locationId,
}: {
  checkout: InventoryCheckoutSession;
  locationId: string;
}) {
  return {
    idempotency_key: `order-${checkout.id}`,
    order: {
      line_items: checkout.lines.map((line) => ({
        base_price_money: toSquareMoney(line.unitPrice, checkout.currency),
        metadata: {
          checkout_line_id: line.id,
          product_id: line.productId,
        },
        name: line.title,
        quantity: String(line.quantity),
      })),
      location_id: locationId,
      metadata: {
        checkout_id: checkout.id,
        public_token: checkout.publicToken,
        ws_id: checkout.wsId,
      },
      reference_id: checkout.publicToken,
    },
  };
}

function buildTerminalCheckoutPayload({
  checkout,
  deviceId,
  orderId,
}: {
  checkout: InventoryCheckoutSession;
  deviceId: string;
  orderId: string;
}) {
  return {
    checkout: {
      amount_money: toSquareMoney(checkout.totalAmount, checkout.currency),
      device_options: {
        device_id: deviceId,
      },
      note: checkout.note || `Tuturuuu order ${checkout.publicToken}`,
      order_id: orderId,
      reference_id: checkout.publicToken,
    },
    idempotency_key: `checkout-${checkout.id}`,
  };
}

export async function createInventorySquareTerminalCheckout({
  checkoutId,
  deviceId,
  wsId,
}: {
  checkoutId: string;
  deviceId?: string;
  wsId: string;
}): Promise<SquareTerminalCheckoutResult> {
  const checkout = await getCheckoutById(wsId, checkoutId);
  if (!checkout) throw new Error('Checkout was not found');
  if (checkout.status !== 'reserved') {
    throw new Error('Only reserved checkouts can be sent to Square Terminal');
  }

  const context = await getInventorySquareTerminalContext(wsId);
  const terminalDeviceId = deviceId?.trim() || context.deviceId;

  try {
    const order = await createSquareOrderApi({
      accessToken: context.accessToken,
      body: buildOrderPayload({ checkout, locationId: context.locationId }),
      environment: context.environment,
    });
    if (!order?.id) throw new Error('Square did not return an order');

    await updateCheckoutSquareState(checkout.id, wsId, {
      square_device_id: terminalDeviceId,
      square_environment: context.environment,
      square_idempotency_key: `checkout-${checkout.id}`,
      square_location_id: context.locationId,
      square_order_id: order.id,
      square_status: 'pending',
    });

    const squareCheckout = await createSquareTerminalCheckoutApi({
      accessToken: context.accessToken,
      body: buildTerminalCheckoutPayload({
        checkout,
        deviceId: terminalDeviceId,
        orderId: order.id,
      }),
      environment: context.environment,
    });
    if (!squareCheckout?.id) {
      throw new Error('Square did not return a terminal checkout');
    }

    await updateCheckoutSquareState(checkout.id, wsId, {
      square_terminal_checkout_id: squareCheckout.id,
      square_status: mapTerminalStatus(squareCheckout.status),
    });

    return {
      checkout: (await getCheckoutById(wsId, checkout.id)) ?? checkout,
      squareCheckout,
    };
  } catch (error) {
    await updateCheckoutSquareState(checkout.id, wsId, {
      square_failure_reason:
        error instanceof Error ? error.message : 'Square checkout failed',
      square_status: 'failed',
    });
    await releaseCheckout(wsId, checkout.id);
    throw error;
  }
}

export async function cancelInventorySquareTerminalCheckout({
  checkoutId,
  wsId,
}: {
  checkoutId: string;
  wsId: string;
}) {
  const checkout = await getCheckoutById(wsId, checkoutId);
  if (!checkout) throw new Error('Checkout was not found');

  if (checkout.squareTerminalCheckoutId) {
    const context = await getInventorySquareTerminalContext(wsId);
    try {
      const squareCheckout = await cancelSquareTerminalCheckoutApi({
        accessToken: context.accessToken,
        checkoutId: checkout.squareTerminalCheckoutId,
        environment: context.environment,
      });
      await updateCheckoutSquareState(checkout.id, wsId, {
        square_status: mapTerminalStatus(squareCheckout?.status ?? 'CANCELED'),
      });
    } catch (error) {
      serverLogger.warn('Failed to cancel Square terminal checkout', {
        checkoutId,
        error: error instanceof Error ? error.message : 'Square cancel failed',
        wsId,
      });
      throw error;
    }
  }

  await releaseCheckout(wsId, checkout.id);
  return (await getCheckoutById(wsId, checkout.id)) ?? checkout;
}

async function findCheckoutBySquareField(field: string, value: string) {
  const privateAdmin = await getPrivateAdmin();
  const { data, error } = (await privateAdmin
    .from('inventory_checkout_sessions' as never)
    .select('id, ws_id')
    .eq(field as never, value)
    .maybeSingle()) as {
    data: { id: string; ws_id: string } | null;
    error: SupabaseErrorLike;
  };

  if (error) throw new Error(error.message ?? 'Failed to find checkout');
  return data;
}

export async function syncInventorySquareTerminalCheckout(
  squareCheckout: SquareApiTerminalCheckout
) {
  if (!squareCheckout.id) return false;
  const checkout = await findCheckoutBySquareField(
    'square_terminal_checkout_id',
    squareCheckout.id
  );
  if (!checkout) return false;

  const status = mapTerminalStatus(squareCheckout.status);
  await updateCheckoutSquareState(checkout.id, checkout.ws_id, {
    square_device_id: squareCheckout.device_options?.device_id ?? null,
    square_order_id: squareCheckout.order_id ?? null,
    square_payment_id: squareCheckout.payment_ids?.[0] ?? null,
    square_status: status,
  });

  if (
    status === 'canceled' ||
    status === 'cancelled' ||
    status === 'expired' ||
    status === 'failed'
  ) {
    await releaseCheckout(checkout.ws_id, checkout.id);
  }

  if (status === 'completed' && squareCheckout.payment_ids?.[0]) {
    await completeSquareCheckoutPayment({
      checkoutId: checkout.id,
      paymentId: squareCheckout.payment_ids[0],
      squareOrderId: squareCheckout.order_id ?? null,
      wsId: checkout.ws_id,
    });
  }

  return true;
}

export async function completeSquareCheckoutPayment({
  checkoutId,
  paymentId,
  receiptUrl,
  squareOrderId,
  wsId,
}: {
  checkoutId: string;
  paymentId: string;
  receiptUrl?: string | null;
  squareOrderId?: string | null;
  wsId: string;
}) {
  const sbAdmin = await createAdminClient();
  const { error } = (await sbAdmin.schema('private').rpc(
    'complete_inventory_checkout_session_square_payment' as never,
    {
      p_checkout_id: checkoutId,
      p_square_order_id: squareOrderId ?? null,
      p_square_payment_id: paymentId,
      p_ws_id: wsId,
    } as never
  )) as { error: SupabaseErrorLike };

  if (error) throw new Error(error.message ?? 'Failed to complete checkout');

  await updateCheckoutSquareState(checkoutId, wsId, {
    square_order_id: squareOrderId ?? undefined,
    square_payment_id: paymentId,
    square_receipt_url: receiptUrl ?? undefined,
    square_status: 'paid',
  });
  await recordInventorySaleFinanceTransaction({ checkoutId });
}

export async function syncInventorySquarePayment(payment: SquareApiPayment) {
  if (!payment.id) return false;
  const orderId = payment.order_id ?? null;
  if (!orderId) return false;

  const checkout = await findCheckoutBySquareField('square_order_id', orderId);
  if (!checkout) return false;

  const status = mapPaymentStatus(payment.status);
  await updateCheckoutSquareState(checkout.id, checkout.ws_id, {
    square_order_id: orderId,
    square_payment_id: payment.id,
    square_receipt_url: payment.receipt_url ?? null,
    square_status: status,
  });

  if (status === 'paid') {
    await completeSquareCheckoutPayment({
      checkoutId: checkout.id,
      paymentId: payment.id,
      receiptUrl: payment.receipt_url ?? null,
      squareOrderId: orderId,
      wsId: checkout.ws_id,
    });
  }

  return true;
}
