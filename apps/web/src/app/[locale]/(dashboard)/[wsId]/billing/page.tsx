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

const fetchWorkspaceOrders = async (wsId: string) => {
  try {
    const polar = createPolarClient();

    // Fetch orders with metadata filter for this workspace
    const response = await polar.orders.list({
      metadata: {
        wsId,
      },
      limit: 10,
      page: 1,
    });

    const orders = response.result?.items ?? [];

    // Sort by creation date descending (newest first)
    return orders.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    console.error('Error fetching workspace orders:', error);
    return [];
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
        const [products, subscription, orders, isCreator] = await Promise.all([
          fetchProducts(),
          fetchSubscription({ wsId }),
          fetchWorkspaceOrders(wsId),
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

        // Transform orders for billing history display
        const billingHistory = orders.map((order) => ({
          id: order.id,
          createdAt: order.createdAt.toISOString(),
          billingReason: order.billingReason as string,
          totalAmount: order.totalAmount,
          currency: order.currency,
          status: order.status as string,
          productName: order.product?.name ?? 'N/A',
        }));

        return (
          <div className="container mx-auto max-w-6xl px-4 py-8">
            <BillingClient
              currentPlan={currentPlan}
              products={products}
              product_id={subscription?.product.id || ''}
              wsId={wsId}
              isCreator={isCreator}
            />

            <Separator className="my-8" />

            <BillingHistory orders={billingHistory} />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
