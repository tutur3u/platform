import { BillingClient } from './billing-client';
import { api } from '@/lib/polar';
import { Button } from '@tuturuuu/ui/button';
import { CheckCircle, CreditCard, Receipt } from 'lucide-react';

const fetchProducts = async () => {
  try {
    const res = await api.products.list({ isArchived: false });
    return res.result.items ?? [];
  } catch (err) {
    console.error('Failed to fetch products:', err);
    return [];
  }
};

export default async function BillingPage() {
  // Fetch data directly on the server
  const products = await fetchProducts();
  console.log(products, 'pro');

  const currentPlan = {
    name: 'Pro',
    price: '$19.99',
    billingCycle: 'month',
    startDate: 'Jan 1, 2023',
    nextBillingDate: 'Jan 1, 2024',
    status: 'active',
    features: [
      'Unlimited projects',
      'Advanced collaboration tools',
      'Priority support',
      'AI-powered insights',
    ],
  };

  const planHistory = [
    {
      planName: products[0]?.name,
      price: products[0]?.name == 'Enterprise' ? '$Custom' : '$19.99',
      // startDate: 'Jan 1, 2023',
      // endDate: 'Dec 31, 2023',
      // status: 'active',
    },
    {
      planName: 'Basic',
      price: '$9.99',
      startDate: 'Jan 1, 2022',
      endDate: 'Dec 31, 2022',
      status: 'inactive',
    },
  ];

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

  // This data is needed by the client component, so we'll pass it as a prop
  const upgradePlans = [
    {
      id: 'pro_monthly',
      name: 'Pro Monthly',
      price: '$25',
      billingCycle: 'month',
      popular: false,
      features: [
        'Everything in Free',
        'Advanced analytics',
        'Up to 10 team members',
        'Email & chat support',
      ],
    },
    {
      id: 'business_monthly',
      name: 'Business',
      price: '$80',
      billingCycle: 'month',
      popular: true,
      features: [
        'Everything in Pro',
        'Unlimited team members',
        'Dedicated account manager',
        '24/7 priority support',
        'Custom branding',
      ],
    },
  ];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Billing</h1>
      <p className="mb-8 text-muted-foreground">
        Manage your billing information and subscriptions here.
      </p>

      {/* The interactive part of the UI is now handled by the BillingClient component.
        We pass the data it needs (currentPlan, upgradePlans) as props.
      */}
      <BillingClient currentPlan={currentPlan} upgradePlans={upgradePlans} />

      {/* Plan History (Static) */}
      <div className="mb-8 rounded-lg border border-border bg-card p-8 shadow-sm dark:bg-card/80">
        <h2 className="mb-6 text-2xl font-semibold text-card-foreground">
          Plan History
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Plan
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Price
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Start Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  End Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {planHistory?.map((plan, index) => (
                <tr key={index}>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {plan.planName}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {plan.price}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {plan.startDate}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {plan.endDate || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs leading-5 font-semibold ${
                        plan.status === 'active'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {plan.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
