import { Webhooks } from '@polar-sh/nextjs';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

// const getAdminClient = async () => {

//   return sbAdmin;
// };
export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
  onSubscriptionActive: async (payload) => {
    const sbAdmin = await createAdminClient();
    if (payload.data.status !== 'active') {
      console.log(
        `Ignoring subscription with status: '${payload.data.status}'.`
      );
      throw new Response(
        'Webhook received, but status is not active. No action taken.',
        { status: 200 }
      );
    }

    const subscriptionData = {
      ws_id:
        typeof payload.data.metadata?.wsId === 'string'
          ? payload.data.metadata.wsId
          : null,
      status: payload.data.status,
      polar_subscription_id: payload.data.id,
      product_id: payload.data.product.id,
      current_period_start: payload.data.currentPeriodStart.toISOString(),
      current_period_end: payload.data.currentPeriodEnd
        ? payload.data.currentPeriodEnd.toISOString()
        : null,
    };
    const { data, error } = await sbAdmin
      .from('workspace_subscription')
      .upsert([subscriptionData])
      .select()
      .single();

    if (error) {
      console.error('Supabase upsert error:', error.message);
      throw new Error('Supabase upsert error:');
    }

    console.log('Successfully upserted subscription in DB:', data);

    // return new Response('Subscription activated', { status: 200 });
  },
  onSubscriptionCanceled: async (payload) => {
    console.log('Subscription canceled:', payload);
    // Handle subscription cancellation logic here
    // return new Response('Subscription canceled', { status: 200 });
  },
});
