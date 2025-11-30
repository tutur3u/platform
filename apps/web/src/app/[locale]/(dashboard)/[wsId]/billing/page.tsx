import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { checkTuturuuuAdmin } from '@tuturuuu/utils/workspace-helper';
import { format } from 'date-fns';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { BillingClient } from './billing-client';
import BillingHistory from './billing-history';

export const metadata: Metadata = {
  title: 'Billing',
  description: 'Manage Billing in your Tuturuuu workspace.',
};

const fetchProducts = async ({
  wsId,
  sandbox,
}: {
  wsId: string;
  sandbox: boolean;
}) => {
  try {
    const polar = createPolarClient({
      sandbox:
        // Always use sandbox for development
        process.env.NODE_ENV === 'development'
          ? true
          : // If the workspace is the root workspace and the sandbox is true, use sandbox
            !!(wsId === ROOT_WORKSPACE_ID && sandbox),
    });

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

const fetchSubscription = async ({
  wsId,
  sandbox,
}: {
  wsId: string;
  sandbox: boolean;
}) => {
  const sbAdmin = await createClient();

  const { data: dbSub, error } = await sbAdmin
    .from('workspace_subscription')
    .select('*')
    .eq('ws_id', wsId)
    .eq('status', 'active')
    .single();

  if (error || !dbSub) {
    console.error('Error fetching subscription:', error);
    return null;
  }

  const polar = createPolarClient({
    sandbox:
      // Always use sandbox for development
      process.env.NODE_ENV === 'development'
        ? true
        : // If the workspace is the root workspace and the sandbox is true, use sandbox
          !!(wsId === ROOT_WORKSPACE_ID && sandbox), // Otherwise, use production
  });

  const polarProduct = await polar.products.get({
    id: dbSub.product_id || '',
  });

  if (!polarProduct) return null;

  return {
    id: dbSub.id,
    status: dbSub.status,
    currentPeriodStart: dbSub.current_period_start,
    currentPeriodEnd: dbSub.current_period_end,
    cancelAtPeriodEnd: dbSub.cancel_at_period_end,
    polarSubscriptionId: dbSub.polar_subscription_id,
    product: polarProduct,
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
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching billing history:', error);
    return [];
  }

  return data ?? [];
};

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ sandbox: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const { sandbox } = await searchParams;

        const enableSandbox = sandbox === 'true';
        const isTuturuuuAdmin = await checkTuturuuuAdmin();
        const [products, subscription, subscriptionHistory, isCreator] =
          await Promise.all([
            fetchProducts({ wsId, sandbox: enableSandbox }),
            fetchSubscription({ wsId, sandbox: enableSandbox }),
            fetchWorkspaceSubscriptions(wsId),
            checkCreator(wsId),
          ]);

        const currentPlan = subscription?.product
          ? {
              id: subscription.id,
              polarSubscriptionId: subscription.polarSubscriptionId,
              productId: subscription.product.id,
              name: subscription.product.name || 'No Plan',
              price:
                subscription.product.prices.length > 0
                  ? subscription.product.prices[0] &&
                    'priceAmount' in subscription.product.prices[0]
                    ? subscription.product.prices[0].priceAmount
                    : 0
                  : 0,
              billingCycle: subscription.product.recurringInterval,
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
              features: subscription.product.benefits.map(
                (benefit) => benefit.description
              ),
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

        const billingHistory = subscriptionHistory.map((sub, index) => ({
          id: sub.id ?? `SUB-${sub.product_id?.slice(-6) || index}`,
          created_at: sub.created_at,
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
              isAdmin={isTuturuuuAdmin}
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
