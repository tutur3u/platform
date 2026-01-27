import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getOrCreatePolarCustomer } from '@/utils/customer-session';
import {
  createFreeSubscription,
  fetchSubscription,
  waitForSubscriptionSync,
} from '@/utils/subscription-helper';
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

const checkCreator = async (wsId: string) => {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error('Error checking user:', userError);
    return false;
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', wsId)
    .single();

  if (error) {
    console.error('Error checking workspace creator:', error);
    return false;
  }

  return data.creator_id === user?.id;
};

const ensureSubscription = async (wsId: string, userId: string) => {
  // Check for existing subscription first
  const existing = await fetchSubscription(wsId);
  if (existing) return { subscription: existing, error: null };

  // No subscription found - attempt to create one
  try {
    const supabase = await createClient();
    const polar = createPolarClient();

    // Get or create Polar customer
    const customerId = await getOrCreatePolarCustomer({
      polar,
      supabase,
      userId,
    });

    // Create free tier subscription
    const subscription = await createFreeSubscription(
      polar,
      supabase,
      wsId,
      customerId
    );

    if (!subscription) {
      return {
        subscription: null,
        error: 'SUBSCRIPTION_CREATE_FAILED',
      };
    }

    // Poll database until webhook processes (max 5 seconds)
    // This replaces the previous 3-second setTimeout with a more reliable polling mechanism
    const newSubscription = await waitForSubscriptionSync(wsId, 10, 500);

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

        const [products, subscriptionResult, orders, isCreator, locale, t] =
          await Promise.all([
            fetchProducts(),
            ensureSubscription(wsId, user.id), // Try to ensure subscription exists
            fetchWorkspaceOrders(wsId),
            checkCreator(wsId),
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
        };

        return (
          <div className="container mx-auto max-w-6xl px-4 py-8">
            <BillingClient
              currentPlan={currentPlan}
              products={products}
              product_id={subscription?.product.id || ''}
              wsId={wsId}
              isCreator={isCreator}
            />

            <BillingHistory orders={orders} />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
