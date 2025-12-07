'use client';

import { Eye } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { centToDollar } from '@/utils/price-helper';
import { OrdersDialog } from './orders-dialog';

interface BillingHistoryItem {
  id: string;
  created_at: string;
  current_period_start: string | null;
  current_period_end: string | null;
  product_id: string | null;
  status: string;
  cancel_at_period_end: boolean | null;
  product: {
    name: string;
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
  const [selectedSubscription, setSelectedSubscription] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20';
      case 'trialing':
        return 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20';
      case 'past_due':
        return 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20';
      case 'canceled':
      case 'cancelled':
        return 'bg-muted text-muted-foreground border-border';
      default:
        return 'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/20';
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return format(new Date(date), 'MMM d, yyyy');
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
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="uppercase tracking-wider">Plan</TableHead>
                <TableHead className="uppercase tracking-wider">
                  Amount
                </TableHead>
                <TableHead className="uppercase tracking-wider">
                  Start Date
                </TableHead>
                <TableHead className="uppercase tracking-wider">
                  End Date
                </TableHead>
                <TableHead className="uppercase tracking-wider">
                  Status
                </TableHead>
                <TableHead className="text-center uppercase tracking-wider">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {billingHistory.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell className="text-card-foreground">
                    <div className="flex flex-col">
                      <div className="font-semibold">
                        {subscription.product?.name || 'Unknown Plan'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-card-foreground">
                    {subscription.product ? (
                      <div className="flex flex-col">
                        <div className="font-semibold">
                          ${centToDollar(subscription.product.price)}
                        </div>
                        <div className="text-muted-foreground text-sm">
                          per {subscription.product.recurring_interval}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-card-foreground">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {formatDate(subscription.current_period_start)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-card-foreground">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {formatDate(subscription.current_period_end)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-md border px-2.5 py-1 font-medium text-xs ${getStatusColor(subscription.status)}`}
                    >
                      {subscription.status.charAt(0).toUpperCase() +
                        subscription.status.slice(1)}
                      {subscription.status === 'active' &&
                        subscription.cancel_at_period_end &&
                        ' (Ending)'}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelectedSubscription({
                          id: subscription.id,
                          name: subscription.product?.name || 'Unknown Plan',
                        })
                      }
                      className="h-9 gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      View Orders
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {selectedSubscription && (
        <OrdersDialog
          open={!!selectedSubscription}
          onOpenChange={(open) => {
            if (!open) setSelectedSubscription(null);
          }}
          subscriptionId={selectedSubscription.id}
          planName={selectedSubscription.name}
        />
      )}
    </div>
  );
}
