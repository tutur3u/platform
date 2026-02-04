import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { createPolarCustomer } from '@/utils/customer-helper';
import { getSeatStatus } from '@/utils/seat-limits';
import { createFreeSubscription } from '@/utils/subscription-helper';
import { BillingClient } from './billing-client';
import BillingHistory from './billing-history';
import { NoSubscriptionFound } from './no-subscription-found';

export const metadata: Metadata = {
  title: 'Billing',
  description: 'Manage Billing in your Tuturuuu workspace.',
};

const fetchProducts = async () => {
  try {
    const polar = createPolarClient();

    const res = await polar.products.list({ isArchived: false });
    return res.result.items ?? [];
  } catch (err) {
    console.error('Failed to fetch products:', err);
    return [];
  }
};

const fetchWorkspaceOrders = async (wsId: string) => {
  try {
    const supabase = await createClient();
    const { data: orders, error } = await supabase
      .from('workspace_orders')
      .select('*, workspace_subscription_products (name, price)')
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching workspace orders:', error);
      return [];
    }

    return orders.map((order) => ({
      id: order.id,
      createdAt: order.created_at,
      billingReason: order.billing_reason ?? 'unknown',
      totalAmount: order.total_amount ?? 0,
      originalAmount: order.workspace_subscription_products?.price ?? 0,
      currency: order.currency ?? 'usd',
      status: order.status,
      productName: order.workspace_subscription_products?.name ?? 'N/A',
    }));
  } catch (error) {
    console.error('Error fetching workspace orders:', error);
    return [];
  }
};

const checkManageSubscriptionPermission = async (
  wsId: string,
  userId: string
) => {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('has_workspace_permission', {
    p_ws_id: wsId,
    p_user_id: userId,
    p_permission: 'manage_subscription',
  });

  if (error) {
    console.error('Error checking manage_subscription permission:', error);
    return false;
  }

  return data ?? false;
};

const ensureSubscription = async (wsId: string) => {
  // Check for existing subscription first
  const existing = await fetchSubscription(wsId);
  if (existing) return { subscription: existing, error: null };

  // No subscription found - attempt to create one
  try {
    const supabase = await createClient();
    const polar = createPolarClient();

    await createPolarCustomer({ polar, supabase, wsId });

    // Create free tier subscription
    const subscription = await createFreeSubscription(polar, supabase, wsId);

    if (!subscription) {
      return {
        subscription: null,
        error: 'SUBSCRIPTION_CREATE_FAILED',
      };
    }

    // Poll database until webhook processes (max 30 seconds)
    const newSubscription = await waitForSubscriptionSync(wsId, 10, 3000);

    if (!newSubscription) {
      return {
        subscription: null,
        error: 'SUBSCRIPTION_SYNC_TIMEOUT',
      };
    }

    return { subscription: newSubscription, error: null };
  } catch (error) {
    console.error('Error ensuring subscription:', error);
    return {
      subscription: null,
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    };
  }
};

export async function fetchSubscription(wsId: string) {
  const supabase = await createClient();

  const { data: dbSub, error } = await supabase
    .from('workspace_subscriptions')
    .select(
      `
      *,
      workspace_subscription_products (
        id,
        name,
        description,
        price,
        recurring_interval,
        tier,
        pricing_model,
        price_per_seat,
        max_seats
      )
    `
    )
    .eq('ws_id', wsId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !dbSub) {
    console.error('Error fetching subscription:', error);
    return null;
  }

  if (!dbSub.workspace_subscription_products) return null;

  return {
    id: dbSub.id,
    status: dbSub.status,
    createdAt: dbSub.created_at,
    currentPeriodStart: dbSub.current_period_start,
    currentPeriodEnd: dbSub.current_period_end,
    cancelAtPeriodEnd: dbSub.cancel_at_period_end,
    product: dbSub.workspace_subscription_products,
    // Seat-based pricing fields
    pricingModel: dbSub.pricing_model,
    seatCount: dbSub.seat_count,
    pricePerSeat: dbSub.price_per_seat,
  };
}

export async function waitForSubscriptionSync(
  wsId: string,
  maxAttempts: number = 10,
  delayMs: number = 500
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const subscription = await fetchSubscription(wsId);

    if (subscription) {
      console.log(
        `Subscription sync: Found subscription after ${attempt} attempt(s) (${attempt * delayMs}ms)`
      );
      return subscription;
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.warn(
    `Subscription sync: Timeout after ${maxAttempts} attempts (${maxAttempts * delayMs}ms)`
  );
  return null;
}

export default async function BillingPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        // Get user first
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return notFound();

        const [
          products,
          subscriptionResult,
          orders,
          hasManageSubscriptionPermission,
          locale,
          t,
        ] = await Promise.all([
          fetchProducts(),
          ensureSubscription(wsId), // Try to ensure subscription exists
          fetchWorkspaceOrders(wsId),
          checkManageSubscriptionPermission(wsId, user.id),
          getLocale(),
          getTranslations('billing'),
        ]);

        // Handle subscription creation failure
        if (!subscriptionResult.subscription) {
          return (
            <NoSubscriptionFound wsId={wsId} error={subscriptionResult.error} />
          );
        }

        const subscription = subscriptionResult.subscription;

        // Get seat status for the workspace
        const seatStatus = await getSeatStatus(supabase, wsId);

        const dateLocale = locale === 'vi' ? vi : enUS;
        const formatDate = (date: string) =>
          format(new Date(date), 'd MMM, yyyy', { locale: dateLocale });

        const currentPlan = {
          id: subscription.id,
          productId: subscription.product.id,
          name: subscription.product.name || t('no-plan'),
          tier: subscription.product.tier,
          price: subscription.product.price ?? 0,
          billingCycle: subscription.product.recurring_interval,
          startDate: subscription.createdAt
            ? formatDate(subscription.createdAt)
            : '-',
          nextBillingDate: subscription.currentPeriodEnd
            ? formatDate(subscription.currentPeriodEnd)
            : '-',
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
          status: subscription.status || 'unknown',
          features: subscription.product.description
            ? [subscription.product.description]
            : [t('premium-features')],
          // Seat-based pricing fields
          pricingModel: subscription.pricingModel,
          seatCount: subscription.seatCount,
          pricePerSeat: subscription.pricePerSeat,
          maxSeats: subscription.product.max_seats,
        };

        return (
          <div className="container mx-auto max-w-6xl px-4 py-8">
            <BillingClient
              currentPlan={currentPlan}
              products={products}
              product_id={subscription?.product.id || ''}
              wsId={wsId}
              seatStatus={seatStatus}
              hasManageSubscriptionPermission={hasManageSubscriptionPermission}
            />

            <BillingHistory orders={orders} />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
