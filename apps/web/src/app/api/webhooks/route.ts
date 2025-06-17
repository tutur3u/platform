import { Polar } from '@tuturuuu/payment/polar';
import { Webhooks } from '@tuturuuu/payment/polar/next';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

// Initialize a Polar ADMIN client with your secret token
// This is needed to report usage events securely.
const polarAdmin = new Polar({
  accessToken: process.env.NEXT_PUBLIC_POLAR_ACCESS_TOKEN,
  server: 'sandbox', // Change to 'production' in production
});

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET || '',

  onSubscriptionActive: async (payload) => {
    try {
      const sbAdmin = await createAdminClient();
      const subscriptionPayload = payload.data;

      // Only process subscriptions that are truly 'active'
      if (subscriptionPayload.status !== 'active') {
        console.log(
          `Ignoring subscription with status: '${subscriptionPayload.status}'.`
        );
        // Use 'return' instead of 'throw' for proper API responses
        throw new Response('Webhook handled: Status not active.', {
          status: 200,
        });
      }

      const ws_id = subscriptionPayload.metadata?.wsId;

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
        // Count the users in the workspace at the moment of subscribing
        const { count: initialUserCount, error: countError } = await sbAdmin
          .from('workspace_users') // Assumes you have a 'workspace_users' table
          .select('*', { count: 'exact', head: true })
          .eq('ws_id', ws_id);

        if (countError) throw countError; // This error will be caught below
        console.log(initialUserCount, 'users found in workspace');
        // Report this initial count to your Polar Meter
        await polarAdmin.events.ingest({
          events: [
            {
              name: 'workspace.seats.sync', // Must match the Event Name in your Meter
              customerId: payload.data.customer.id,
              metadata: {
                seat_count: initialUserCount ?? 0, // Must match the Property Name in your Meter
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
    // Your cancellation logic here...
    console.log('Subscription canceled:', payload);
    throw new Response('Cancellation webhook received.', { status: 200 });
  },
});
