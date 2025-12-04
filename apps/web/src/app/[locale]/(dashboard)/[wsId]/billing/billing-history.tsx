import { Receipt } from '@tuturuuu/icons';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { centToDollar } from '@/utils/price-helper';

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
  const t = useTranslations('billing');
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
    const createdDate = format(new Date(item.created_at), 'MMM d, yyyy');

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
        <h2 className="mb-6 font-semibold text-2xl text-card-foreground">
          {t('subscription-history')}
        </h2>
        {billingHistory.length === 0 ? (
          <p className="text-muted-foreground">
            {t('subscription-history-desc')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-border border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-sm uppercase tracking-wider">
                    Subscription #
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-sm uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-sm uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-sm uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-sm uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-sm uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {billingHistory.map((subscription) => (
                  <tr key={subscription.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-card-foreground">
                      {subscription.id}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-card-foreground">
                      {getDisplayDate(subscription)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-card-foreground">
                      <div>
                        <div className="font-medium">
                          {subscription.product?.name || 'Unknown Plan'}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-card-foreground">
                      {subscription.product ? (
                        <div>
                          <div className="font-medium">
                            {`$${centToDollar(subscription.product.price)}`}
                          </div>
                          <div className="text-muted-foreground text-sm">
                            per {subscription.product.recurring_interval}
                          </div>
                        </div>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 font-semibold text-xs leading-5 ${getStatusColor(subscription.status)}`}
                      >
                        {subscription.status.charAt(0).toUpperCase() +
                          subscription.status.slice(1)}
                        {subscription.status === 'active' &&
                          subscription.cancel_at_period_end &&
                          ' (Ending)'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
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
