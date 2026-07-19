import 'server-only';

import { randomUUID } from 'node:crypto';
import type { InventoryCheckoutSession } from '@tuturuuu/internal-api/inventory';
import { getCheckoutById, releaseCheckout } from '../checkouts';
import { retrieveSquareOrderApi, retrieveSquarePaymentApi } from './client';
import {
  getInventorySquareAccessContextForEnvironment,
  getInventorySquarePosContext,
} from './connection-store';
import { getPrivateAdmin, type SupabaseErrorLike } from './settings-store';
import { completeSquareCheckoutPayment } from './terminal';
import type {
  SquareApiOrder,
  SquareApiPayment,
  SquarePosCheckoutResult,
  SquarePosLaunch,
} from './types';

const ANDROID_PREFIX = 'com.squareup.pos.';

export type SquarePosCallbackPayload = {
  clientTransactionId: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  requestState: string | null;
  transactionId: string | null;
};

type SquarePosCheckoutRow = {
  checkout_provider: string | null;
  currency: string;
  id: string;
  public_token: string;
  square_environment: string | null;
  square_location_id: string | null;
  square_order_id: string | null;
  square_pos_request_id: string | null;
  status: string;
  total_amount: number;
  ws_id: string;
};

export type SquarePosCallbackOutcome = {
  checkout: InventoryCheckoutSession;
  outcome: 'cancelled' | 'completed' | 'pending' | 'review';
};

export class SquarePosCallbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SquarePosCallbackError';
  }
}

function parseIosData(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(value)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseSquarePosCallback(
  params: URLSearchParams
): SquarePosCallbackPayload {
  const ios = parseIosData(params.get('data'));
  if (ios) {
    return {
      clientTransactionId: stringValue(ios.client_transaction_id),
      errorCode: stringValue(ios.error_code),
      errorDescription: stringValue(ios.error_description),
      requestState: stringValue(ios.state),
      transactionId: stringValue(ios.transaction_id),
    };
  }

  return {
    clientTransactionId: params.get(`${ANDROID_PREFIX}CLIENT_TRANSACTION_ID`),
    errorCode: params.get(`${ANDROID_PREFIX}ERROR_CODE`),
    errorDescription: params.get(`${ANDROID_PREFIX}ERROR_DESCRIPTION`),
    requestState: params.get(`${ANDROID_PREFIX}REQUEST_METADATA`),
    transactionId: params.get(`${ANDROID_PREFIX}SERVER_TRANSACTION_ID`),
  };
}

function androidValue(value: string) {
  return encodeURIComponent(value);
}

export function buildSquarePosLaunch({
  amount,
  applicationId,
  callbackUrl,
  currency,
  fallbackUrl,
  locationId,
  note,
  requestState,
}: {
  amount: number;
  applicationId: string;
  callbackUrl: string;
  currency: string;
  fallbackUrl: string;
  locationId: string;
  note: string;
  requestState: string;
}): SquarePosLaunch {
  const normalizedAmount = Math.max(0, Math.round(amount));
  const normalizedCurrency = currency.trim().toUpperCase();
  const androidUrl = [
    'intent:#Intent',
    'action=com.squareup.pos.action.CHARGE',
    'package=com.squareup',
    `S.browser_fallback_url=${androidValue(fallbackUrl)}`,
    `S.${ANDROID_PREFIX}WEB_CALLBACK_URI=${androidValue(callbackUrl)}`,
    `S.${ANDROID_PREFIX}CLIENT_ID=${androidValue(applicationId)}`,
    `S.${ANDROID_PREFIX}LOCATION_ID=${androidValue(locationId)}`,
    `S.${ANDROID_PREFIX}API_VERSION=v2.0`,
    `i.${ANDROID_PREFIX}TOTAL_AMOUNT=${normalizedAmount}`,
    `S.${ANDROID_PREFIX}CURRENCY_CODE=${androidValue(normalizedCurrency)}`,
    `S.${ANDROID_PREFIX}TENDER_TYPES=${ANDROID_PREFIX}TENDER_CARD`,
    `S.${ANDROID_PREFIX}REQUEST_METADATA=${androidValue(requestState)}`,
    `S.${ANDROID_PREFIX}NOTE=${androidValue(note)}`,
    `l.${ANDROID_PREFIX}AUTO_RETURN_TIMEOUT_MS=3200`,
    'end',
  ].join(';');
  const iosPayload = {
    amount_money: {
      amount: normalizedAmount,
      currency_code: normalizedCurrency,
    },
    callback_url: callbackUrl,
    client_id: applicationId,
    location_id: locationId,
    notes: note,
    options: {
      auto_return: true,
      clear_default_fees: true,
      skip_receipt: false,
      supported_tender_types: ['CREDIT_CARD'],
    },
    state: requestState,
    version: '1.3',
  };

  return {
    androidUrl,
    callbackUrl,
    fallbackUrl,
    iosUrl: `square-commerce-v1://payment/create?data=${encodeURIComponent(
      JSON.stringify(iosPayload)
    )}`,
  };
}

function parseRequestState(state: string | null) {
  if (!state) throw new SquarePosCallbackError('Square POS state is missing');
  const separator = state.lastIndexOf('.');
  if (separator <= 0 || separator === state.length - 1) {
    throw new SquarePosCallbackError('Square POS state is invalid');
  }
  return {
    publicToken: state.slice(0, separator),
    requestId: state.slice(separator + 1),
  };
}

async function loadSquarePosCheckout(publicToken: string) {
  const privateAdmin = await getPrivateAdmin();
  const { data, error } = (await privateAdmin
    .from('inventory_checkout_sessions' as never)
    .select(
      'id, ws_id, public_token, status, checkout_provider, currency, total_amount, square_environment, square_location_id, square_order_id, square_pos_request_id'
    )
    .eq('public_token' as never, publicToken)
    .maybeSingle()) as {
    data: SquarePosCheckoutRow | null;
    error: SupabaseErrorLike;
  };

  if (error) {
    throw new SquarePosCallbackError(
      error.message ?? 'Square POS checkout could not be loaded'
    );
  }
  if (!data) throw new SquarePosCallbackError('Square POS checkout not found');
  return data;
}

async function updateSquarePosState(
  checkout: Pick<SquarePosCheckoutRow, 'id' | 'ws_id'>,
  values: Record<string, unknown>
) {
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_checkout_sessions' as never)
    .update({
      ...values,
      checkout_provider: 'square_pos',
      square_last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id' as never, checkout.id)
    .eq('ws_id' as never, checkout.ws_id)) as { error: SupabaseErrorLike };

  if (error) {
    throw new SquarePosCallbackError(
      error.message ?? 'Square POS checkout could not be updated'
    );
  }
}

function assertPosOrder(
  order: SquareApiOrder,
  checkout: SquarePosCheckoutRow,
  transactionId: string
) {
  if (order.id !== transactionId) {
    throw new SquarePosCallbackError('Square returned a different order');
  }
  if (order.location_id !== checkout.square_location_id) {
    throw new SquarePosCallbackError(
      'Square payment used a different selling location'
    );
  }
  if ((order.state ?? '').toUpperCase() !== 'COMPLETED') {
    throw new SquarePosCallbackError('Square order is not completed yet');
  }
}

export function assertPosPayment(
  payment: SquareApiPayment,
  checkout: Pick<
    SquarePosCheckoutRow,
    'currency' | 'square_location_id' | 'total_amount'
  >,
  orderId: string
) {
  if ((payment.status ?? '').toUpperCase() !== 'COMPLETED') {
    throw new SquarePosCallbackError('Square payment is not completed yet');
  }
  if (payment.order_id !== orderId) {
    throw new SquarePosCallbackError('Square payment belongs to another order');
  }
  if (payment.location_id !== checkout.square_location_id) {
    throw new SquarePosCallbackError(
      'Square payment used a different selling location'
    );
  }
  if ((payment.source_type ?? '').toUpperCase() !== 'CARD') {
    throw new SquarePosCallbackError(
      'Only verified card payments are accepted'
    );
  }
  if (payment.amount_money?.amount !== checkout.total_amount) {
    throw new SquarePosCallbackError('Square payment amount does not match');
  }
  if (
    (payment.amount_money?.currency ?? '').toUpperCase() !==
    checkout.currency.toUpperCase()
  ) {
    throw new SquarePosCallbackError('Square payment currency does not match');
  }
}

async function verifySquarePosOrderAndPayment(
  checkout: SquarePosCheckoutRow,
  transactionId: string
) {
  const context = await getInventorySquareAccessContextForEnvironment(
    checkout.ws_id,
    'production'
  );
  const order = await retrieveSquareOrderApi({
    accessToken: context.accessToken,
    environment: 'production',
    orderId: transactionId,
  });
  if (!order) throw new SquarePosCallbackError('Square order was not found');
  assertPosOrder(order, checkout, transactionId);

  const paymentId = order.tenders?.find(
    (tender) => tender.payment_id
  )?.payment_id;
  if (!paymentId) {
    throw new SquarePosCallbackError('Square payment is still synchronizing');
  }
  const payment = await retrieveSquarePaymentApi({
    accessToken: context.accessToken,
    environment: 'production',
    paymentId,
  });
  if (!payment)
    throw new SquarePosCallbackError('Square payment was not found');
  assertPosPayment(payment, checkout, transactionId);

  await completeSquareCheckoutPayment({
    checkoutId: checkout.id,
    paymentId,
    provider: 'square_pos',
    receiptUrl: payment.receipt_url ?? null,
    squareOrderId: transactionId,
    wsId: checkout.ws_id,
  });
}

export async function createInventorySquarePosCheckout({
  callbackUrl,
  checkoutId,
  fallbackUrl,
  wsId,
}: {
  callbackUrl: string;
  checkoutId: string;
  fallbackUrl: string;
  wsId: string;
}): Promise<SquarePosCheckoutResult> {
  const checkout = await getCheckoutById(wsId, checkoutId);
  if (!checkout) throw new Error('Checkout was not found');
  if (checkout.status !== 'reserved') {
    throw new Error('Only reserved checkouts can be sent to Square POS');
  }

  const context = await getInventorySquarePosContext(wsId);
  const requestId = randomUUID();
  const requestState = `${checkout.publicToken}.${requestId}`;
  await updateSquarePosState(
    { id: checkout.id, ws_id: checkout.wsId },
    {
      square_environment: 'production',
      square_failure_reason: null,
      square_location_id: context.locationId,
      square_pos_request_id: requestId,
      square_status: 'pending',
    }
  );
  const launch = buildSquarePosLaunch({
    amount: checkout.totalAmount,
    applicationId: context.applicationId,
    callbackUrl,
    currency: checkout.currency,
    fallbackUrl,
    locationId: context.locationId,
    note: `Tuturuuu order ${checkout.publicToken}`,
    requestState,
  });

  return {
    checkout: (await getCheckoutById(wsId, checkout.id)) ?? checkout,
    launch,
  };
}

export async function completeInventorySquarePosCallback(
  payload: SquarePosCallbackPayload
): Promise<SquarePosCallbackOutcome> {
  const state = parseRequestState(payload.requestState);
  const checkout = await loadSquarePosCheckout(state.publicToken);
  if (
    checkout.checkout_provider !== 'square_pos' ||
    checkout.square_pos_request_id !== state.requestId ||
    checkout.square_environment !== 'production'
  ) {
    throw new SquarePosCallbackError('Square POS state did not match checkout');
  }

  if (checkout.status === 'completed') {
    const completed = await getCheckoutById(checkout.ws_id, checkout.id);
    if (!completed) throw new SquarePosCallbackError('Checkout was not found');
    return { checkout: completed, outcome: 'completed' };
  }

  if (payload.errorCode) {
    await updateSquarePosState(checkout, {
      square_failure_reason:
        payload.errorDescription || payload.errorCode || 'Square POS cancelled',
      square_pos_client_transaction_id: payload.clientTransactionId,
      square_status: 'failed',
    });
    const released = await releaseCheckout(checkout.ws_id, checkout.id);
    if (!released) throw new SquarePosCallbackError('Checkout was not found');
    return { checkout: released, outcome: 'cancelled' };
  }

  if (!payload.transactionId) {
    await updateSquarePosState(checkout, {
      square_failure_reason:
        'Square did not return an online transaction ID. Review this payment before changing stock.',
      square_pos_client_transaction_id: payload.clientTransactionId,
      square_status: 'in_progress',
    });
    const pending = await getCheckoutById(checkout.ws_id, checkout.id);
    if (!pending) throw new SquarePosCallbackError('Checkout was not found');
    return { checkout: pending, outcome: 'review' };
  }

  await updateSquarePosState(checkout, {
    square_failure_reason: null,
    square_order_id: payload.transactionId,
    square_pos_client_transaction_id: payload.clientTransactionId,
    square_status: 'in_progress',
  });

  try {
    await verifySquarePosOrderAndPayment(checkout, payload.transactionId);
  } catch (error) {
    await updateSquarePosState(checkout, {
      square_failure_reason:
        error instanceof Error ? error.message : 'Square verification failed',
      square_status: 'in_progress',
    });
    const pending = await getCheckoutById(checkout.ws_id, checkout.id);
    if (!pending) throw new SquarePosCallbackError('Checkout was not found');
    return { checkout: pending, outcome: 'pending' };
  }

  const completed = await getCheckoutById(checkout.ws_id, checkout.id);
  if (!completed) throw new SquarePosCallbackError('Checkout was not found');
  return { checkout: completed, outcome: 'completed' };
}

export async function reconcileInventorySquarePosCheckout(
  checkout: InventoryCheckoutSession
) {
  if (
    checkout.checkoutProvider !== 'square_pos' ||
    checkout.status !== 'reserved' ||
    !checkout.squareOrderId
  ) {
    return checkout;
  }

  const row = await loadSquarePosCheckout(checkout.publicToken);
  try {
    await verifySquarePosOrderAndPayment(row, checkout.squareOrderId);
  } catch (error) {
    console.warn('Square POS checkout reconciliation is still pending', {
      checkoutId: checkout.id,
      error:
        error instanceof Error ? error.message : 'Square verification failed',
      wsId: checkout.wsId,
    });
  }
  return (await getCheckoutById(checkout.wsId, checkout.id)) ?? checkout;
}
