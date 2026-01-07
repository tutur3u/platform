import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceSubscriptionWithProduct } from '@tuturuuu/types/db';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { BillingClient } from './billing-client';
import BillingHistory from './billing-history';

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

const fetchSubscription = async (wsId: string) => {
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
        tier
      )
    `
    )
    .eq('ws_id', wsId)
    .eq('status', 'active')
    .single();

  if (error || !dbSub) {
    console.error('Error fetching subscription:', error);
    return null;
  }

  const typedSub = dbSub as WorkspaceSubscriptionWithProduct;

  if (!typedSub.workspace_subscription_products) return null;

  return {
    id: typedSub.id,
    status: typedSub.status,
    createdAt: typedSub.created_at,
    currentPeriodStart: typedSub.current_period_start,
    currentPeriodEnd: typedSub.current_period_end,
    cancelAtPeriodEnd: typedSub.cancel_at_period_end,
    polarSubscriptionId: typedSub.polar_subscription_id,
    product: typedSub.workspace_subscription_products,
  };
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

export default async function BillingPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const [products, subscription, orders, isCreator, locale, t] =
          await Promise.all([
            fetchProducts(),
            fetchSubscription(wsId),
            fetchWorkspaceOrders(wsId),
            checkCreator(wsId),
            getLocale(),
            getTranslations('billing'),
          ]);

        const dateLocale = locale === 'vi' ? vi : enUS;
        const formatDate = (date: string) =>
          format(new Date(date), 'd MMM, yyyy', { locale: dateLocale });

        const currentPlan = subscription
          ? {
              id: subscription.id,
              productId: subscription.product.id,
              name: subscription.product.name || t('no-plan'),
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
            }
          : {
              id: '',
              productId: '',
              name: t('free-plan'),
              price: 0,
              billingCycle: 'month',
              startDate: '-',
              nextBillingDate: '-',
              cancelAtPeriodEnd: false,
              status: 'active',
              features: [t('basic-features'), t('limited-usage')],
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
