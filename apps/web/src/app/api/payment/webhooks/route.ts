import type { Order, Subscription } from '@tuturuuu/payment/polar';
import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { Webhooks } from '@tuturuuu/payment/polar/next';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceProductTier } from '@tuturuuu/types';
import { assignSeatsToAllMembers } from '@/utils/polar-seat-helper';
import {
  createFreeSubscription,
  hasActiveSubscription,
} from '@/utils/subscription-helper';

// Helper function to report initial seat usage to Polar
export async function reportInitialUsage(wsId: string, customerId: string) {
  const sbAdmin = await createAdminClient();

  const { count: initialUserCount, error: countError } = await sbAdmin
    .from('workspace_members')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

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
export async function syncSubscriptionToDatabase(subscription: Subscription) {
  const sbAdmin = await createAdminClient();

  const wsId = subscription.metadata?.wsId;

  if (!wsId || typeof wsId !== 'string') {
    console.error('Webhook Error: Workspace ID not found.');
    throw new Response('Webhook Error: Workspace ID not found.', {
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
    ws_id: wsId,
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
    seat_count: seatCount,
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

  return { subscriptionData, isSeatBased };
}

// Helper function to sync order data from Polar to DB
export async function syncOrderToDatabase(order: Order) {
  const sbAdmin = await createAdminClient();
  const wsId = order.metadata?.wsId;

  if (!wsId || typeof wsId !== 'string') {
    console.error('Webhook Error: Workspace ID not found.');
    throw new Response('Webhook Error: Workspace ID not found.', {
      status: 400,
    });
  }

  const orderData = {
    ws_id: wsId,
    polar_order_id: order.id,
    status: order.status as any,
    polar_subscription_id: order.subscriptionId,
    product_id: order.productId,
    total_amount: order.totalAmount,
    currency: order.currency,
    billing_reason: order.billingReason as any,
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

  return { wsId, orderData };
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET || '',

  onProductCreated: async (payload) => {
    console.log('Product created:', payload);

    const product = payload.data;

    // Validate metadata before entering try-catch to ensure proper error response
    const metadataProductTier = product.metadata?.product_tier;

    if (!metadataProductTier || typeof metadataProductTier !== 'string') {
      console.error(
        'Webhook Error: product_tier metadata is missing or invalid.'
      );
      throw new Response(
        'Webhook Error: product_tier metadata is missing or invalid.',
        {
          status: 400,
        }
      );
    }

    const tier = metadataProductTier.toUpperCase() as WorkspaceProductTier;

    try {
      const sbAdmin = await createAdminClient();

      const firstPrice = product.prices.find((p) => 'amountType' in p);

      const isSeatBased = firstPrice?.amountType === 'seat_based';
      const isFixed = firstPrice?.amountType === 'fixed';

      const price = isFixed ? firstPrice.priceAmount : null;

      const pricePerSeat = isSeatBased
        ? (firstPrice?.seatTiers?.tiers?.[0]?.pricePerSeat ?? null)
        : null;

      const minSeats = isSeatBased ? firstPrice?.seatTiers?.minimumSeats : null;

      const maxSeats = isSeatBased ? firstPrice?.seatTiers?.maximumSeats : null;

      const productData = {
        id: product.id,
        name: product.name,
        description: product.description || '',
        price: price,
        recurring_interval: product.recurringInterval || 'month',
        tier,
        archived: product.isArchived ?? false,
        pricing_model: firstPrice?.amountType,
        price_per_seat: pricePerSeat,
        min_seats: minSeats,
        max_seats: maxSeats,
      };

      const { error: dbError } = await sbAdmin
        .from('workspace_subscription_products')
        .insert(productData);

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

    const product = payload.data;

    // Validate metadata before entering try-catch to ensure proper error response
    const metadataProductTier = product.metadata?.product_tier;

    if (!metadataProductTier || typeof metadataProductTier !== 'string') {
      console.error(
        'Webhook Error: product_tier metadata is missing or invalid.'
      );
      throw new Response(
        'Webhook Error: product_tier metadata is missing or invalid.',
        {
          status: 400,
        }
      );
    }

    // Only set tier if it matches valid enum values
    const tier = metadataProductTier.toUpperCase() as WorkspaceProductTier;

    try {
      const sbAdmin = await createAdminClient();

      const firstPrice = product.prices.find((p) => 'amountType' in p);

      const isSeatBased = firstPrice?.amountType === 'seat_based';
      const isFixed = firstPrice?.amountType === 'fixed';

      const price = isFixed ? firstPrice.priceAmount : null;

      const pricePerSeat = isSeatBased
        ? (firstPrice?.seatTiers?.tiers?.[0]?.pricePerSeat ?? null)
        : null;

      const minSeats = isSeatBased ? firstPrice?.seatTiers?.minimumSeats : null;

      const maxSeats = isSeatBased ? firstPrice?.seatTiers?.maximumSeats : null;

      const { error: dbError } = await sbAdmin
        .from('workspace_subscription_products')
        .update({
          name: product.name,
          description: product.description || '',
          price,
          recurring_interval: product.recurringInterval as string,
          tier,
          archived: product.isArchived,
          // Seat-based pricing fields
          pricing_model: firstPrice?.amountType,
          price_per_seat: pricePerSeat,
          min_seats: minSeats,
          max_seats: maxSeats,
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
      const { subscriptionData, isSeatBased } =
        await syncSubscriptionToDatabase(payload.data);
      console.log('Webhook: Subscription created:', payload.data.id);

      // Report initial usage for new subscriptions (only non-seat-based)
      // Seat-based subscriptions use Polar Seats entity instead of events
      if (payload.data.status === 'active' && !isSeatBased) {
        try {
          await reportInitialUsage(
            subscriptionData.ws_id,
            payload.data.customer.id
          );
        } catch (e) {
          // Log but don't fail - subscription is already saved
          console.error('Webhook: Failed to report initial usage', e);
        }
      }

      // Assign Polar seats to all current members if seat-based subscription
      if (payload.data.status === 'active' && isSeatBased) {
        console.log(
          `Webhook: Assigning seats to all members in workspace ${subscriptionData.ws_id}`
        );
        try {
          const polar = createPolarClient();
          const supabase = await createAdminClient();
          await assignSeatsToAllMembers(
            polar,
            supabase,
            subscriptionData.ws_id,
            payload.data.id
          );
        } catch (e) {
          // Log but don't fail - subscription is already saved
          console.error('Webhook: Failed to assign seats to members', e);
        }
      }

      console.log(
        `Webhook: Subscription created for workspace ${subscriptionData.ws_id}.`
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error('Webhook: Subscription created error:', errorMessage);
      throw new Response('Internal Server Error', { status: 500 });
    }
  },

  // Handle ALL subscription updates (status changes, plan changes, cancellations, etc.)
  onSubscriptionUpdated: async (payload) => {
    try {
      const { subscriptionData, isSeatBased } =
        await syncSubscriptionToDatabase(payload.data);
      console.log(
        `Webhook: Subscription updated: ${payload.data.id}, status: ${payload.data.status}`
      );

      // If subscription just became active, handle usage reporting and seat assignment
      if (payload.data.status === 'active') {
        // Report usage for non-seat-based subscriptions only
        if (!isSeatBased) {
          try {
            await reportInitialUsage(
              subscriptionData.ws_id,
              payload.data.customer.id
            );
          } catch (e) {
            console.error('Webhook: Failed to report usage on activation', e);
          }
        }

        // Assign seats for seat-based subscriptions (upgrade flow)
        if (isSeatBased) {
          console.log(
            `Webhook: Subscription activated with seat-based pricing, assigning seats to all members in workspace ${subscriptionData.ws_id}`
          );
          try {
            const polar = createPolarClient();
            const supabase = await createAdminClient();
            await assignSeatsToAllMembers(
              polar,
              supabase,
              subscriptionData.ws_id,
              payload.data.id
            );
          } catch (e) {
            console.error('Webhook: Failed to assign seats on activation', e);
          }
        }
      }

      // If subscription is fully canceled, check if workspace needs a free subscription
      if (payload.data.status === 'canceled') {
        console.log(
          `Webhook: Subscription ${payload.data.id} is fully canceled, checking if workspace ${subscriptionData.ws_id} needs a free subscription`
        );

        const sbAdmin = await createAdminClient();
        const polar = createPolarClient();

        // Check if workspace has any other active subscriptions
        const hasActive = await hasActiveSubscription(
          sbAdmin,
          subscriptionData.ws_id
        );

        if (!hasActive) {
          console.log(
            `Webhook: Workspace ${subscriptionData.ws_id} has no active subscriptions, creating free subscription`
          );

          // Create a free subscription for this workspace
          const freeSubscription = await createFreeSubscription(
            polar,
            sbAdmin,
            subscriptionData.ws_id
          );

          if (freeSubscription) {
            console.log(
              `Webhook: Successfully created free subscription ${freeSubscription.id} for workspace ${subscriptionData.ws_id}`
            );
          } else {
            console.warn(
              `Webhook: Could not create free subscription for workspace ${subscriptionData.ws_id}`
            );
          }
        } else {
          console.log(
            `Webhook: Workspace ${subscriptionData.ws_id} still has active subscriptions, no free subscription needed`
          );
        }
      }

      console.log(
        `Webhook: Subscription updated for workspace ${subscriptionData.ws_id}, status: ${payload.data.status}`
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
      const { wsId, orderData } = await syncOrderToDatabase(payload.data);
      console.log(
        `Webhook: Order created: ${payload.data.id}, status: ${orderData.status}, billing_reason: ${orderData.billing_reason}`
      );
      console.log(`Webhook: Order created for workspace ${wsId}.`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error('Webhook: Order created error:', errorMessage);
      throw new Response('Internal Server Error', { status: 500 });
    }
  },

  // Handle order updates (status changes, payment confirmations, refunds, etc.)
  onOrderUpdated: async (payload) => {
    try {
      const { wsId, orderData } = await syncOrderToDatabase(payload.data);
      console.log(
        `Webhook: Order updated: ${payload.data.id}, status: ${orderData.status}, billing_reason: ${orderData.billing_reason}`
      );
      console.log(
        `Webhook: Order updated for workspace ${wsId}, new status: ${orderData.status}`
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error('Webhook: Order updated error:', errorMessage);
      throw new Response('Internal Server Error', { status: 500 });
    }
  },
});
