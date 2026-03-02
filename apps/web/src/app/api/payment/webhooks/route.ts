import { Webhooks } from '@tuturuuu/payment/polar/next';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { upsertSubscriptionError } from '@/app/api/payment/migrations/helper';
import { syncOrderToDatabase } from '@/utils/polar-order-helper';
import { syncProductToDatabase } from '@/utils/polar-product-helper';
import { assignSeatsToAllMembers } from '@/utils/polar-seat-helper';
import { syncSubscriptionToDatabase } from '@/utils/polar-subscription-helper';
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

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET || '',

  onProductCreated: async (payload) => {
    try {
      const sbAdmin = await createAdminClient();
      await syncProductToDatabase(sbAdmin, payload.data);

      console.log(`Webhook: Product created successfully: ${payload.data.id}`);
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
    try {
      const sbAdmin = await createAdminClient();
      await syncProductToDatabase(sbAdmin, payload.data);

      console.log(`Webhook: Product updated successfully: ${payload.data.id}`);
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
      const sbAdmin = await createAdminClient();
      const syncResult = await syncSubscriptionToDatabase(
        sbAdmin,
        payload.data
      );
      if ('purchaseData' in syncResult) return;
      const { subscriptionData, isSeatBased } = syncResult;

      console.log('Webhook: Subscription created:', payload.data.id);

      if (!subscriptionData) return;

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

          await assignSeatsToAllMembers(
            polar,
            sbAdmin,
            subscriptionData.ws_id,
            payload.data.id
          );
        } catch (e) {
          // Log but don't fail - subscription is already saved
          console.error('Webhook: Failed to assign seats to members', e);
        }
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error('Webhook: Subscription created error:', errorMessage);
      throw new Response('Internal Server Error', { status: 500 });
    }
  },

  // Handle ALL subscription updates (status changes, plan changes, cancellations, etc.)
  onSubscriptionUpdated: async (payload) => {
    try {
      const sbAdmin = await createAdminClient();
      const syncResult = await syncSubscriptionToDatabase(
        sbAdmin,
        payload.data
      );
      if ('purchaseData' in syncResult) return;
      const { subscriptionData, isSeatBased } = syncResult;

      console.log(`Webhook: Subscription updated: ${payload.data.id}`);

      if (!subscriptionData) return;

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
            await assignSeatsToAllMembers(
              polar,
              sbAdmin,
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

        const polar = createPolarClient();
        const sbAdmin = await createAdminClient();

        // Check if workspace has any other active subscriptions
        const { hasWorkspace, hasActive } = await hasActiveSubscription(
          polar,
          sbAdmin,
          subscriptionData.ws_id
        );

        if (!hasWorkspace) {
          console.warn(
            `Webhook: Workspace ${subscriptionData.ws_id} not found when checking for active subscriptions`
          );
          return;
        }

        if (!hasActive) {
          console.log(
            `Webhook: Workspace ${subscriptionData.ws_id} has no active subscriptions, creating free subscription`
          );

          // Create a free subscription for this workspace
          const freeSubResult = await createFreeSubscription(
            polar,
            sbAdmin,
            subscriptionData.ws_id
          );

          if (freeSubResult.status === 'created') {
            console.log(
              `Webhook: Successfully created free subscription ${freeSubResult.subscription.id} for workspace ${subscriptionData.ws_id}`
            );
          } else {
            console.warn(
              `Webhook: Could not create free subscription for workspace ${subscriptionData.ws_id} (${freeSubResult.status})`
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

  // Handle subscription revocation (admin-initiated or Polar-side)
  onSubscriptionRevoked: async (payload) => {
    try {
      const sbAdmin = await createAdminClient();
      const syncResult = await syncSubscriptionToDatabase(
        sbAdmin,
        payload.data
      );
      if ('purchaseData' in syncResult) return;
      const { subscriptionData } = syncResult;
      console.log(`Webhook: Subscription revoked: ${payload.data.id}`);

      if (!subscriptionData) return;

      // Check if workspace needs a free subscription (same logic as canceled)
      const polar = createPolarClient();

      const { hasWorkspace, hasActive } = await hasActiveSubscription(
        polar,
        sbAdmin,
        subscriptionData.ws_id
      );

      if (!hasWorkspace) {
        console.warn(
          `Webhook: Workspace ${subscriptionData.ws_id} not found when handling revocation`
        );
        return;
      }

      if (!hasActive) {
        console.log(
          `Webhook: Workspace ${subscriptionData.ws_id} has no active subscriptions after revocation, creating free subscription`
        );

        const freeSubResult = await createFreeSubscription(
          polar,
          sbAdmin,
          subscriptionData.ws_id
        );

        if (freeSubResult.status === 'created') {
          console.log(
            `Webhook: Successfully created free subscription ${freeSubResult.subscription.id} for workspace ${subscriptionData.ws_id}`
          );
        } else if (freeSubResult.status === 'error') {
          console.warn(
            `Webhook: Could not create free subscription for workspace ${subscriptionData.ws_id}: ${freeSubResult.message}`
          );

          await upsertSubscriptionError(
            sbAdmin,
            subscriptionData.ws_id,
            freeSubResult.message,
            'webhook'
          );
        }
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error('Webhook: Subscription revoked error:', errorMessage);
      throw new Response('Internal Server Error', { status: 500 });
    }
  },

  // Handle new order creation
  onOrderCreated: async (payload) => {
    try {
      const sbAdmin = await createAdminClient();
      await syncOrderToDatabase(sbAdmin, payload.data);

      console.log(`Webhook: Order created: ${payload.data.id}`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error('Webhook: Order created error:', errorMessage);
      throw new Response('Internal Server Error', { status: 500 });
    }
  },

  // Handle order updates (status changes, payment confirmations, refunds, etc.)
  onOrderUpdated: async (payload) => {
    try {
      const sbAdmin = await createAdminClient();
      await syncOrderToDatabase(sbAdmin, payload.data);

      console.log(`Webhook: Order updated: ${payload.data.id}`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error('Webhook: Order updated error:', errorMessage);
      throw new Response('Internal Server Error', { status: 500 });
    }
  },
});
