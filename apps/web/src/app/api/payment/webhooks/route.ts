import type { Order, Subscription } from '@tuturuuu/payment/polar';
import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { Webhooks } from '@tuturuuu/payment/polar/next';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Constants, type WorkspaceProductTier } from '@tuturuuu/types';
import {
  createFreeSubscription,
  hasActiveSubscription,
} from '@/utils/subscription-helper';

// Helper function to report initial seat usage to Polar
async function reportInitialUsage(ws_id: string, customerId: string) {
  const sbAdmin = await createAdminClient();

  const { count: initialUserCount, error: countError } = await sbAdmin
    .from('workspace_members')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', ws_id);

  if (countError) throw countError;

  const polar = createPolarClient();

  await polar.events.ingest({
    events: [
      {
        name: 'workspace.seats.sync',
        customerId: customerId,
        metadata: {
          seat_count: initialUserCount ?? 0,
        },
      },
    ],
  });

  console.log(
    `Webhook: Successfully reported initial usage of ${initialUserCount} seats.`
  );
}

// Helper function to sync subscription data from Polar to DB
async function syncSubscriptionToDatabase(subscription: Subscription) {
  const sbAdmin = await createAdminClient();
  const ws_id = subscription.metadata?.wsId;

  if (!ws_id || typeof ws_id !== 'string') {
    console.error('Webhook Error: Workspace ID (wsId) not found in metadata.');
    throw new Response('Webhook Error: Missing wsId in metadata', {
      status: 400,
    });
  }

  // Check if product is seat-based
  const { data: product } = await sbAdmin
    .from('workspace_subscription_products')
    .select('pricing_model, price_per_seat')
    .eq('id', subscription.product.id)
    .single();

  const isSeatBased = product?.pricing_model === 'seat_based';
  const seatCount = isSeatBased ? (subscription.seats ?? 1) : null;

  const subscriptionData = {
    ws_id: ws_id,
    status: subscription.status as any,
    polar_subscription_id: subscription.id,
    product_id: subscription.product.id,
    current_period_start:
      subscription.currentPeriodStart instanceof Date
        ? subscription.currentPeriodStart.toISOString()
        : new Date(subscription.currentPeriodStart).toISOString(),
    current_period_end:
      subscription.currentPeriodEnd instanceof Date
        ? subscription.currentPeriodEnd.toISOString()
        : subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd).toISOString()
          : null,
    cancel_at_period_end: subscription.cancelAtPeriodEnd ?? false,
    created_at:
      subscription.createdAt instanceof Date
        ? subscription.createdAt.toISOString()
        : new Date(subscription.createdAt).toISOString(),
    updated_at:
      subscription.modifiedAt instanceof Date
        ? subscription.modifiedAt.toISOString()
        : subscription.modifiedAt
          ? new Date(subscription.modifiedAt).toISOString()
          : null,
    // Seat-based pricing fields
    pricing_model: isSeatBased ? ('seat_based' as const) : ('fixed' as const),
    seat_count: seatCount,
    price_per_seat: product?.price_per_seat ?? null,
  };

  // Update existing subscription
  const { error: dbError } = await sbAdmin
    .from('workspace_subscriptions')
    .upsert([subscriptionData], {
      onConflict: 'polar_subscription_id',
      ignoreDuplicates: false,
    });

  if (dbError) {
    console.error('Webhook: Supabase error:', dbError.message);
    throw new Error(`Database Error: ${dbError.message}`);
  }

  return { ws_id, subscriptionData, isSeatBased };
}

// Helper function to sync order data from Polar to DB
async function syncOrderToDatabase(order: Order) {
  const sbAdmin = await createAdminClient();
  const ws_id = order.metadata?.wsId;

  if (!ws_id || typeof ws_id !== 'string') {
    console.error(
      'Webhook Error: Workspace ID (wsId) not found in order metadata.'
    );
    throw new Response('Webhook Error: Missing wsId in order metadata', {
      status: 400,
    });
  }

  const orderData = {
    ws_id: ws_id,
    polar_order_id: order.id,
    status: order.status as any,
    polar_subscription_id: order.subscriptionId,
    product_id: order.productId,
    total_amount: order.totalAmount,
    currency: order.currency,
    billing_reason: order.billingReason as any,
    user_id: order.customer.externalId,
    created_at:
      order.createdAt instanceof Date
        ? order.createdAt.toISOString()
        : new Date(order.createdAt).toISOString(),
    updated_at:
      order.modifiedAt instanceof Date
        ? order.modifiedAt.toISOString()
        : order.modifiedAt
          ? new Date(order.modifiedAt).toISOString()
          : null,
  };

  // Upsert order data
  const { error: dbError } = await sbAdmin
    .from('workspace_orders')
    .upsert([orderData], {
      onConflict: 'polar_order_id',
      ignoreDuplicates: false,
    });

  if (dbError) {
    console.error('Webhook: Supabase order error:', dbError.message);
    throw new Error(`Database Error: ${dbError.message}`);
  }

  return { ws_id, orderData };
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET || '',

  onProductCreated: async (payload) => {
    console.log('Product created:', payload);

    try {
      const sbAdmin = await createAdminClient();
      const product = payload.data;

      // Extract product_tier from metadata
      const validTiers = Constants.public.Enums.workspace_product_tier;
      const metadataProductTier = product.metadata?.product_tier;

      // Only set tier if it matches valid enum values
      const tier =
        metadataProductTier &&
        typeof metadataProductTier === 'string' &&
        validTiers.includes(
          metadataProductTier.toUpperCase() as WorkspaceProductTier
        )
          ? (metadataProductTier.toUpperCase() as WorkspaceProductTier)
          : null;

      // Check if product is seat-based (from metadata)
      const isSeatBased = product.metadata?.pricing_model === 'seat_based';
      const pricePerSeat = isSeatBased
        ? product.prices.length > 0 &&
          product.prices[0] &&
          'priceAmount' in product.prices[0]
          ? product.prices[0].priceAmount
          : null
        : null;

      const { error: dbError } = await sbAdmin
        .from('workspace_subscription_products')
        .insert({
          id: product.id,
          name: product.name,
          description: product.description || '',
          price:
            product.prices.length > 0
              ? product.prices[0] && 'priceAmount' in product.prices[0]
                ? product.prices[0].priceAmount
                : 0
              : 0,
          recurring_interval: product.recurringInterval,
          tier,
          archived: product.isArchived,
          // Seat-based pricing fields
          pricing_model: isSeatBased ? 'seat_based' : 'fixed',
          price_per_seat: pricePerSeat,
        });

      if (dbError) {
        console.error('Webhook: Product insert error:', dbError.message);
        throw new Response(`Database Error: ${dbError.message}`, {
          status: 500,
        });
      }

      console.log(`Webhook: Product created successfully: ${product.id}`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error(
        'An unexpected error occurred in the product created webhook handler:',
        errorMessage
      );
      throw new Response('Internal Server Error', { status: 500 });
    }
  },

  onProductUpdated: async (payload) => {
    console.log('Product updated:', payload);

    try {
      const sbAdmin = await createAdminClient();
      const product = payload.data;

      // Extract product_tier from metadata
      const validTiers = Constants.public.Enums.workspace_product_tier;
      const metadataProductTier = product.metadata?.product_tier;

      // Only set tier if it matches valid enum values
      const tier =
        metadataProductTier &&
        typeof metadataProductTier === 'string' &&
        validTiers.includes(
          metadataProductTier.toUpperCase() as WorkspaceProductTier
        )
          ? (metadataProductTier.toUpperCase() as WorkspaceProductTier)
          : null;

      // Check if product is seat-based (from metadata)
      const isSeatBased = product.metadata?.pricing_model === 'seat_based';
      const pricePerSeat = isSeatBased
        ? product.prices.length > 0 &&
          product.prices[0] &&
          'priceAmount' in product.prices[0]
          ? product.prices[0].priceAmount
          : null
        : null;

      const { error: dbError } = await sbAdmin
        .from('workspace_subscription_products')
        .update({
          name: product.name,
          description: product.description || '',
          price:
            product.prices.length > 0
              ? product.prices[0] && 'priceAmount' in product.prices[0]
                ? product.prices[0].priceAmount
                : 0
              : 0,
          recurring_interval: product.recurringInterval,
          tier,
          archived: product.isArchived,
          // Seat-based pricing fields
          pricing_model: isSeatBased ? 'seat_based' : 'fixed',
          price_per_seat: pricePerSeat,
        })
        .eq('id', product.id);

      if (dbError) {
        console.error('Webhook: Product upsert error:', dbError.message);
        throw new Response(`Database Error: ${dbError.message}`, {
          status: 500,
        });
      }

      console.log(`Webhook: Product updated successfully: ${product.id}`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error(
        'An unexpected error occurred in the product updated webhook handler:',
        errorMessage
      );
      throw new Response('Internal Server Error', { status: 500 });
    }
  },

  // Handle new subscription creation
  onSubscriptionCreated: async (payload) => {
    try {
      const { ws_id } = await syncSubscriptionToDatabase(payload.data);
      console.log('Webhook: Subscription created:', payload.data.id);

      // Report initial usage for new subscriptions
      if (payload.data.status === 'active') {
        try {
          await reportInitialUsage(ws_id, payload.data.customer.id);
        } catch (e) {
          // Log but don't fail - subscription is already saved
          console.error('Webhook: Failed to report initial usage', e);
        }
      }

      console.log(`Webhook: Subscription created for workspace ${ws_id}.`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error('Webhook: Subscription created error:', errorMessage);
      throw new Response('Internal Server Error', { status: 500 });
    }
  },

  // Handle ALL subscription updates (status changes, plan changes, cancellations, etc.)
  onSubscriptionUpdated: async (payload) => {
    try {
      const { ws_id } = await syncSubscriptionToDatabase(payload.data);
      console.log(
        `Webhook: Subscription updated: ${payload.data.id}, status: ${payload.data.status}`
      );

      // If subscription just became active, report usage
      if (payload.data.status === 'active') {
        try {
          await reportInitialUsage(ws_id, payload.data.customer.id);
        } catch (e) {
          console.error('Webhook: Failed to report usage on activation', e);
        }
      }

      // If subscription is fully canceled, check if workspace needs a free subscription
      if (payload.data.status === 'canceled') {
        console.log(
          `Webhook: Subscription ${payload.data.id} is fully canceled, checking if workspace ${ws_id} needs a free subscription`
        );

        const sbAdmin = await createAdminClient();
        const polar = createPolarClient();

        // Check if workspace has any other active subscriptions
        const hasActive = await hasActiveSubscription(sbAdmin, ws_id);

        if (!hasActive) {
          console.log(
            `Webhook: Workspace ${ws_id} has no active subscriptions, creating free subscription`
          );

          // Create a free subscription for this workspace
          const freeSubscription = await createFreeSubscription(
            polar,
            sbAdmin,
            ws_id,
            payload.data.customer.id
          );

          if (freeSubscription) {
            console.log(
              `Webhook: Successfully created free subscription ${freeSubscription.id} for workspace ${ws_id}`
            );
          } else {
            console.warn(
              `Webhook: Could not create free subscription for workspace ${ws_id}`
            );
          }
        } else {
          console.log(
            `Webhook: Workspace ${ws_id} still has active subscriptions, no free subscription needed`
          );
        }
      }

      console.log(
        `Webhook: Subscription updated for workspace ${ws_id}, status: ${payload.data.status}`
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error('Webhook: Subscription updated error:', errorMessage);
      throw new Response('Internal Server Error', { status: 500 });
    }
  },

  // Handle new order creation
  onOrderCreated: async (payload) => {
    try {
      const { ws_id, orderData } = await syncOrderToDatabase(payload.data);
      console.log(
        `Webhook: Order created: ${payload.data.id}, status: ${orderData.status}, billing_reason: ${orderData.billing_reason}`
      );
      console.log(`Webhook: Order created for workspace ${ws_id}.`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error('Webhook: Order created error:', errorMessage);
      throw new Response('Internal Server Error', { status: 500 });
    }
  },

  // Handle order updates (status changes, payment confirmations, refunds, etc.)
  onOrderUpdated: async (payload) => {
    try {
      const { ws_id, orderData } = await syncOrderToDatabase(payload.data);
      console.log(
        `Webhook: Order updated: ${payload.data.id}, status: ${orderData.status}, billing_reason: ${orderData.billing_reason}`
      );
      console.log(
        `Webhook: Order updated for workspace ${ws_id}, new status: ${orderData.status}`
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error('Webhook: Order updated error:', errorMessage);
      throw new Response('Internal Server Error', { status: 500 });
    }
  },
});
