// import { Webhooks } from '@polar-sh/nextjs';
// export const POST = Webhooks({
//   webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
//   onSubscriptionActive: async (payload) => {
//     console.log('Subscription activated:', payload);
//     // Handle subscription activation logic here
//     // return new Response('Subscription activated', { status: 200 });
//   },
//   onSubscriptionCanceled: async (payload) => {
//     console.log('Subscription canceled:', payload);
//     // Handle subscription cancellation logic here
//     // return new Response('Subscription canceled', { status: 200 });
//   },
// });
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export async function POST(_req: NextRequest, res: NextResponse) {
  //   const webhook = new Webhook({
  //     secret: process.env.POLAR_WEBHOOK_SECRET!,
  //   });
  //   try {
  //     const event = await webhook.verify(req);
  //     switch (event.type) {
  //       case 'subscription.active':
  //         console.log('Subscription activated:', event.data);
  //         break;
  //       case 'subscription.canceled':
  //         console.log('Subscription canceled:', event.data);
  //         break;
  //       default:
  //         console.warn('Unhandled event type:', event.type);
  //     }
  //     return new Response('Webhook received', { status: 200 });
  //   } catch (error) {
  //     console.error('Webhook verification failed:', error);
  //     return new Response('Webhook verification failed', { status: 400 });
  //   }
}
