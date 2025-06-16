import { Webhooks } from '@polar-sh/nextjs';

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
  onSubscriptionActive: async (payload) => {
    console.log('Subscription activated:', payload);
    // Handle subscription activation logic here
    // return new Response('Subscription activated', { status: 200 });
  },
  onSubscriptionCanceled: async (payload) => {
    console.log('Subscription canceled:', payload);
    // Handle subscription cancellation logic here
    // return new Response('Subscription canceled', { status: 200 });
  },
});
