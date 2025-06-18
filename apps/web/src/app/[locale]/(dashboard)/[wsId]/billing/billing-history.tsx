import { Receipt } from 'lucide-react';
import React from 'react';

interface BillingHistoryItem {
  id: string;
  created_at: string;
  product_id: string | null;
  status: string;
  cancel_at_period_end: boolean | null;
  product: {
    name: string;
    description: string | null;
    price: number;
    recurring_interval: string;
  } | null;
}

export default function BillingHistory({
  billingHistory,
}: {
  billingHistory: BillingHistoryItem[];
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'past_due':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'canceled':
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
      case 'incomplete':
      case 'incomplete_expired':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const getDisplayDate = (item: BillingHistoryItem) => {
    const createdDate = new Date(item.created_at).toLocaleDateString();

    switch (item.status) {
      case 'active':
        return `Started: ${createdDate}`;
      case 'past_due':
        return `Due: ${createdDate}`;
      case 'canceled':
      case 'cancelled':
        return `Cancelled: ${createdDate}`;
      default:
        return createdDate;
    }
  };

  return (
    <div>
      <div className="rounded-lg border border-border bg-card p-8 shadow-sm dark:bg-card/80">
        <h2 className="mb-6 text-2xl font-semibold text-card-foreground">
          Subscription History
        </h2>
        {billingHistory.length === 0 ? (
          <p className="text-muted-foreground">
            No subscription history available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                    Subscription #
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                    Plan
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
                {billingHistory.map((subscription) => (
                  <tr key={subscription.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                      {subscription.id}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                      {getDisplayDate(subscription)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                      <div>
                        <div className="font-medium">
                          {subscription.product?.name || 'Unknown Plan'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                      {subscription.product ? (
                        <div>
                          <div className="font-medium">
                            ${subscription.product.price}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            per {subscription.product.recurring_interval}
                          </div>
                        </div>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs leading-5 font-semibold ${getStatusColor(subscription.status)}`}
                      >
                        {subscription.status.charAt(0).toUpperCase() +
                          subscription.status.slice(1)}
                        {subscription.cancel_at_period_end && ' (Ending)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p
                        className="text-primary hover:text-primary/80"
                        title="Download Receipt"
                      >
                        <Receipt className="h-5 w-5" />
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
