import { BillingClient } from './billing-client';
import { ROOT_WORKSPACE_ID } from '@/constants/common';
import { api } from '@/lib/polar';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Receipt } from 'lucide-react';

const fetchProducts = async () => {
  try {
    const res = await api.products.list({ isArchived: false });
    return res.result.items ?? [];
  } catch (err) {
    console.error('Failed to fetch products:', err);
    return [];
  }
};

const checkCreator = async (wsId: string) => {
  const supabase = await createClient();

  if (wsId !== ROOT_WORKSPACE_ID) {
    console.error('Billing page is only available for root workspace');
    return false;
  }

  // Call the 'check_ws_creator' function with the 'ws_id' argument.
  // The keys in the second object MUST match the argument names in your function.
  const { data, error } = await supabase.rpc('check_ws_creator', {
    ws_id: wsId,
  });

  if (error) {
    console.error('Error checking workspace creator status:', error);
    // As a safe default, deny access if there's an error.
    return true;
  }

  // The 'data' returned from the RPC will be the boolean result.
  return data;
};
const fetchSubscription = async (wsId: string) => {
  const sbAdmin = await createClient();

  // 1. Get the subscription record from your DB
  const { data: dbSub, error } = await sbAdmin
    .from('workspace_subscription')
    .select('*')
    .eq('ws_id', wsId)
    .eq('status', 'active')
    .single();

  if (error || !dbSub) {
    console.error(
      'Error fetching subscription or subscription not found:',
      error
    );
    return null;
  }

  // 2. If it exists, get the full product details from Polar
  const polarProduct = dbSub.product_id
    ? await api.products.get({ id: dbSub.product_id })
    : null;

  if (!polarProduct) {
    return null; // Can't proceed without product details
  }

  // 3. Combine the data into one clean object
  return {
    status: dbSub.status,
    currentPeriodStart: dbSub.current_period_start,
    currentPeriodEnd: dbSub.current_period_end,
    product: {
      id: polarProduct.id,
      name: polarProduct.name,
      description: polarProduct.description,
      price: polarProduct.prices[0] || null,
    },
  };
};

export default async function BillingPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  // const products = await fetchProducts();
  // const subscription = await fetchSubscription((await params).wsId);
  const { wsId } = await params;
  const [products, subscription, isCreator] = await Promise.all([
    fetchProducts(),
    fetchSubscription(wsId),
    checkCreator(wsId),
  ]);
  // console.log(subscription, 'Subscription Data');

  const currentPlan = subscription?.product
    ? {
        name: subscription.product.name || 'No Plan',
        price:
          subscription.product.price &&
          'priceAmount' in subscription.product.price
            ? `$${(subscription.product.price.priceAmount / 100).toFixed(2)}`
            : 'Free',
        billingCycle:
          subscription.product.price?.type === 'recurring'
            ? subscription.product.price?.recurringInterval || 'month'
            : 'one-time',
        startDate: subscription.currentPeriodStart
          ? new Date(subscription.currentPeriodStart).toLocaleDateString()
          : '-',
        nextBillingDate: subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
          : '-',
        status: subscription.status || 'inactive',
        features: [
          subscription.product.description || 'Standard features',
          'Customer support',
          'Access to platform features',
        ],
      }
    : {
        name: 'Free Plan',
        price: '$0',
        billingCycle: 'month',
        startDate: '-',
        nextBillingDate: '-',
        status: 'active',
        features: ['Basic features', 'Limited usage', 'Community support'],
      };

  const paymentHistory = [
    {
      id: 'INV-2023-06',
      date: 'Jun 15, 2023',
      amount: '$19.99',
      status: 'Paid',
    },
    {
      id: 'INV-2023-05',
      date: 'May 15, 2023',
      amount: '$19.99',
      status: 'Paid',
    },
    {
      id: 'INV-2023-04',
      date: 'Apr 15, 2023',
      amount: '$19.99',
      status: 'Paid',
    },
  ];

  const upgradePlans = products.map((product, index) => ({
    id: product.id,
    name: product.name,
    price:
      product.prices && product.prices.length > 0
        ? product.prices[0] && 'priceAmount' in product.prices[0]
          ? `$${((product.prices[0] as any).priceAmount / 100).toFixed(2)}`
          : 'Free'
        : 'Custom',
    billingCycle:
      product.prices && product.prices.length > 0
        ? product.prices[0]?.type === 'recurring'
          ? product.prices[0]?.recurringInterval || 'month'
          : 'one-time'
        : 'month',
    popular: index === 1, // Make the second product popular as example
    features: product.description
      ? [product.description, 'Customer support', 'Access to platform features']
      : [
          'Standard features',
          'Customer support',
          'Access to platform features',
        ],
    isEnterprise: product.name.toLowerCase().includes('enterprise'),
  }));

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Billing</h1>
      <p className="mb-8 text-muted-foreground">
        Manage your billing information and subscriptions here.
      </p>

      <BillingClient
        currentPlan={currentPlan}
        upgradePlans={upgradePlans}
        wsId={wsId}
        isCreator={isCreator}
      />

      {/* Payment History (Static) */}
      <div className="rounded-lg border border-border bg-card p-8 shadow-sm dark:bg-card/80">
        <h2 className="mb-6 text-2xl font-semibold text-card-foreground">
          Payment History
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Invoice #
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paymentHistory.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {payment.id}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {payment.date}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {payment.amount}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs leading-5 font-semibold ${
                        payment.status === 'Paid'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}
                    >
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      className="text-primary hover:text-primary/80"
                      title="Download Receipt"
                    >
                      <Receipt className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
