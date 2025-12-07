import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceSubscriptionWithProduct } from '@tuturuuu/types/db';
import { Separator } from '@tuturuuu/ui/separator';
import { format } from 'date-fns';
import type { Metadata } from 'next';
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

const fetchSubscription = async ({ wsId }: { wsId: string }) => {
  const supabase = await createClient();

  const { data: dbSub, error } = await supabase
    .from('workspace_subscription')
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
    currentPeriodStart: typedSub.current_period_start,
    currentPeriodEnd: typedSub.current_period_end,
    cancelAtPeriodEnd: typedSub.cancel_at_period_end,
    polarSubscriptionId: typedSub.polar_subscription_id,
    product: typedSub.workspace_subscription_products,
  };
};

const fetchWorkspaceSubscriptions = async (wsId: string) => {
  const sbAdmin = await createClient();

  const { data, error } = await sbAdmin
    .from('workspace_subscription')
    .select(
      `
      id,
      created_at,
      current_period_start,
      current_period_end,
      product_id,
      status,
      cancel_at_period_end,
      workspace_subscription_products (
        name,
        description,
        price,
        recurring_interval
      )
    `
    )
    .eq('ws_id', wsId)
    .order('current_period_end', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching billing history:', error);
    return [];
  }

  return data ?? [];
};

export default async function BillingPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const [products, subscription, subscriptionHistory, isCreator] =
          await Promise.all([
            fetchProducts(),
            fetchSubscription({ wsId }),
            fetchWorkspaceSubscriptions(wsId),
            checkCreator(wsId),
          ]);

        const currentPlan = subscription
          ? {
              id: subscription.id,
              polarSubscriptionId: subscription.polarSubscriptionId,
              productId: subscription.product.id,
              name: subscription.product.name || 'No Plan',
              price: subscription.product.price ?? 0,
              billingCycle: subscription.product.recurring_interval,
              startDate: subscription.currentPeriodStart
                ? format(
                    new Date(subscription.currentPeriodStart),
                    'MMM d, yyyy'
                  )
                : '-',
              nextBillingDate: subscription.currentPeriodEnd
                ? format(new Date(subscription.currentPeriodEnd), 'MMM d, yyyy')
                : '-',
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
              status: subscription.status || 'unknown',
              features: subscription.product.description
                ? [subscription.product.description]
                : ['Premium features'],
            }
          : {
              id: '',
              polarSubscriptionId: '',
              productId: '',
              name: 'Free Plan',
              price: 0,
              billingCycle: 'month',
              startDate: '-',
              nextBillingDate: '-',
              cancelAtPeriodEnd: false,
              status: 'active',
              features: ['Basic features', 'Limited usage'],
            };

        const billingHistory = subscriptionHistory.map((sub) => ({
          id: sub.id,
          created_at: sub.created_at,
          current_period_start: sub.current_period_start,
          current_period_end: sub.current_period_end,
          product_id: sub.product_id,
          status: sub.status ?? 'unknown',
          cancel_at_period_end: sub.cancel_at_period_end,
          product: sub.workspace_subscription_products
            ? {
                name:
                  sub.workspace_subscription_products.name || 'Unknown Plan',
                description: sub.workspace_subscription_products.description,
                price: sub.workspace_subscription_products.price || 0,
                recurring_interval:
                  sub.workspace_subscription_products.recurring_interval ||
                  'one-time',
              }
            : null,
        }));

        return (
          <div className="container mx-auto max-w-6xl px-4 py-8">
            <BillingClient
              currentPlan={currentPlan}
              products={products}
              product_id={subscription?.product.id || ''}
              wsId={wsId}
              activeSubscriptionId={subscription?.polarSubscriptionId || ''}
              isCreator={isCreator}
            />

            <Separator className="my-8" />

            <BillingHistory billingHistory={billingHistory} />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
