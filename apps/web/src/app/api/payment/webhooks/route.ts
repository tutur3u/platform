import type { Subscription } from '@tuturuuu/payment/polar';
import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { Webhooks } from '@tuturuuu/payment/polar/next';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Constants, type WorkspaceProductTier } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

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

  const subscriptionData = {
    ws_id: ws_id,
    status: subscription.status,
    polar_subscription_id: subscription.id,
    product_id: subscription.product.id,
    current_period_start: subscription.currentPeriodStart.toISOString(),
    current_period_end: subscription.currentPeriodEnd
      ? subscription.currentPeriodEnd.toISOString()
      : null,
    cancel_at_period_end: subscription.cancelAtPeriodEnd,
    updated_at: new Date().toISOString(),
  };

  // Update existing subscription
  const { error: dbError } = await sbAdmin
    .from('workspace_subscription')
    .upsert(subscriptionData, {
      onConflict: 'polar_subscription_id',
      ignoreDuplicates: false,
    })
    .eq('polar_subscription_id', subscription.id);

  if (dbError) {
    console.error('Webhook: Supabase error:', dbError.message);
    throw new Error(`Database Error: ${dbError.message}`);
  }

  return { ws_id, subscriptionData };
}

// Helper function to report initial seat usage to Polar
async function reportInitialUsage(
  ws_id: string,
  customerId: string,
  metadata?: Record<string, unknown>
) {
  const sbAdmin = await createAdminClient();

  const { count: initialUserCount, error: countError } = await sbAdmin
    .from('workspace_users')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', ws_id);

  if (countError) throw countError;

  const sandbox =
    metadata?.sandbox === 'true' || process.env.NODE_ENV === 'development';

  const polar = createPolarClient({
    sandbox:
      process.env.NODE_ENV === 'development'
        ? true
        : !!(ws_id === ROOT_WORKSPACE_ID && sandbox),
  });

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

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET || '',

  // Handle new subscription creation
  onSubscriptionCreated: async (payload) => {
    try {
      const { ws_id } = await syncSubscriptionToDatabase(payload.data);
      console.log('Webhook: Subscription created:', payload.data.id);

      // Report initial usage for new subscriptions
      if (payload.data.status === 'active') {
        try {
          await reportInitialUsage(
            ws_id,
            payload.data.customer.id,
            payload.data.metadata
          );
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
          await reportInitialUsage(
            ws_id,
            payload.data.customer.id,
            payload.data.metadata
          );
        } catch (e) {
          console.error('Webhook: Failed to report usage on activation', e);
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
});
