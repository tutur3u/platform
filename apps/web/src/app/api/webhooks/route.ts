import { ROOT_WORKSPACE_ID } from '@/constants/common';
import { createPolarClient } from '@/lib/polar';
import { Webhooks } from '@tuturuuu/payment/polar/next';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

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
        // polar_customer_id: payload.customer.id,
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

        const polarClient = createPolarClient({
          sandbox:
            // Always use sandbox for development
            process.env.NODE_ENV === 'development'
              ? true
              : // If the workspace is the root workspace and the sandbox is true, use sandbox
                ws_id === ROOT_WORKSPACE_ID && sandbox
                ? true // Enable sandbox for root workspace
                : false, // Otherwise, use production
        });

        await polarClient.events.ingest({
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

  onSubscriptionCanceled: async (payload) => {
    console.log('Subscription canceled:', payload);
    throw new Response('Cancellation webhook received.', { status: 200 });
  },
});
