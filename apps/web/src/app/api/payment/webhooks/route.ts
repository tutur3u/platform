import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { Webhooks } from '@tuturuuu/payment/polar/next';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Constants, type WorkspaceProductTier } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET || '',

  onSubscriptionActive: async (payload) => {
    console.log(payload, 'Received subscription active webhook payload');
    try {
      const sbAdmin = await createAdminClient();
      const subscriptionPayload = payload.data;

      if (subscriptionPayload.status !== 'active') {
        console.log(
          `Ignoring subscription with status: '${subscriptionPayload.status}'.`
        );

        throw new Response('Webhook handled: Status not active.', {
          status: 200,
        });
      }

      const ws_id = subscriptionPayload.metadata?.wsId;
      const sandbox =
        subscriptionPayload.metadata?.sandbox === 'true' ||
        process.env.NODE_ENV === 'development';

      if (!ws_id || typeof ws_id !== 'string') {
        console.error(
          'Webhook Error: Workspace ID (wsId) not found in metadata.'
        );
        throw new Response('Webhook Error: Missing wsId in metadata', {
          status: 400,
        });
      }

      // --- 1. SAVE THE SUBSCRIPTION TO YOUR DATABASE ---
      const subscriptionData = {
        ws_id: ws_id,
        status: subscriptionPayload.status,
        polar_subscription_id: subscriptionPayload.id,
        product_id: subscriptionPayload.product.id,
        current_period_start:
          subscriptionPayload.currentPeriodStart.toISOString(),
        current_period_end: subscriptionPayload.currentPeriodEnd
          ? subscriptionPayload.currentPeriodEnd.toISOString()
          : null,
      };

      const { data: dbResult, error: dbError } = await sbAdmin
        .from('workspace_subscription')
        .upsert([subscriptionData])
        .select()
        .single();

      if (dbError) {
        console.error('Webhook: Supabase upsert error:', dbError.message);
        throw new Response(`Database Error: ${dbError.message}`, {
          status: 500,
        });
      }
      console.log('Successfully upserted subscription in DB:', dbResult);

      // --- 2. REPORT INITIAL USAGE (The fix to make the meter work) ---
      try {
        const { count: initialUserCount, error: countError } = await sbAdmin
          .from('workspace_users')
          .select('*', { count: 'exact', head: true })
          .eq('ws_id', ws_id);

        if (countError) throw countError;

        const polar = createPolarClient({
          sandbox:
            // Always use sandbox for development
            process.env.NODE_ENV === 'development'
              ? true
              : // If the workspace is the root workspace and the sandbox is true, use sandbox
                !!(ws_id === ROOT_WORKSPACE_ID && sandbox), // Otherwise, use production
        });

        await polar.events.ingest({
          events: [
            {
              name: 'workspace.seats.sync',
              customerId: payload.data.customer.id,
              metadata: {
                seat_count: initialUserCount ?? 0,
              },
            },
          ],
        });
        console.log(
          `Webhook: Successfully reported initial usage of ${initialUserCount} seats.`
        );
      } catch (e) {
        // Log the error but don't fail the entire webhook, as the subscription is already saved
        console.error('Webhook: Failed to report initial usage', e);
      }

      console.log(`Webhook: Subscription active for workspace ${ws_id}.`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error(
        'An unexpected error occurred in the webhook handler:',
        errorMessage
      );
      throw new Response('Internal Server Error', { status: 500 });
    }
  },
  onSubscriptionRevoked: async (payload) => {
    console.log('Subscription revoked:', payload);

    try {
      const sbAdmin = await createAdminClient();
      const subscriptionPayload = payload.data;
      const ws_id = subscriptionPayload.metadata?.wsId;

      if (subscriptionPayload.status !== 'incomplete') {
        console.log(
          `Ignoring subscription with status: '${subscriptionPayload.status}'.`
        );
        throw new Response('Webhook handled: Status not revoked.', {
          status: 200,
        });
      }

      // const sandbox =
      //   subscriptionPayload.metadata?.sandbox === 'true' ||
      //   process.env.NODE_ENV === 'development';

      if (!ws_id || typeof ws_id !== 'string') {
        console.error(
          'Webhook Error: Workspace ID (wsId) not found in metadata.'
        );
        throw new Response('Webhook Error: Missing wsId in metadata', {
          status: 400,
        });
      }

      const { error: dbError } = await sbAdmin
        .from('workspace_subscription')
        .update({
          status: 'past_due',
          polar_subscription_id: subscriptionPayload.id,
        })
        .eq('ws_id', ws_id)
        .select()
        .single();

      if (dbError) {
        console.error('Webhook: Supabase upsert error:', dbError.message);
        throw new Response(`Database Error: ${dbError.message}`, {
          status: 500,
        });
      }

      // console.log('Successfully updated subscription in DB:', dbResult);

      console.log(`Webhook: Subscription revoked for workspace ${ws_id}.`);
      throw new Response('Revoked webhook handled successfully.', {
        status: 200,
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error(
        'An unexpected error occurred in the revoked webhook handler:',
        errorMessage
      );
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
