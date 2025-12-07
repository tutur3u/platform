'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2, Package, Receipt } from '@tuturuuu/icons';
import type { CustomerOrder } from '@tuturuuu/payment/polar';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { format } from 'date-fns';
import { centToDollar } from '@/utils/price-helper';

interface OrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: string;
  planName: string;
}

export function OrdersDialog({
  open,
  onOpenChange,
  subscriptionId,
  planName,
}: OrdersDialogProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['subscription-orders', subscriptionId],
    queryFn: async () => {
      const response = await fetch(
        `/api/payment/customer-portal/subscriptions/${subscriptionId}/orders`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      return response.json() as Promise<{ orders: CustomerOrder[] }>;
    },
    enabled: open,
  });

  const getStatusColor = (billingReason: string) => {
    switch (billingReason) {
      case 'purchase':
        return 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20';
      case 'subscription_create':
      case 'subscription_cycle':
        return 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20';
      case 'subscription_update':
        return 'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const formatBillingReason = (reason: string) => {
    return reason
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-primary" />
            <DialogTitle className="font-bold text-2xl tracking-tight">
              Orders for {planName}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 p-6 text-center">
              <p className="text-dynamic-red">Failed to load orders</p>
              <p className="mt-2 text-muted-foreground text-sm">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          ) : !data?.orders || data.orders.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 p-12 text-center">
              <Receipt className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="font-medium text-muted-foreground">
                No orders found
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                Orders will appear here once they are created for this
                subscription.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-border border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground text-sm uppercase tracking-wider">
                      Order ID
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground text-sm uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground text-sm uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground text-sm uppercase tracking-wider">
                      Total Amount
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground text-sm uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.orders.map((order) => (
                    <tr
                      key={order.id}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-4 font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {order.id.slice(0, 8)}...
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <span className="font-medium">
                          {format(new Date(order.createdAt), 'MMM d, yyyy')}
                        </span>
                        <div className="text-muted-foreground text-xs">
                          {format(new Date(order.createdAt), 'HH:mm')}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <span
                          className={`inline-flex items-center rounded-md border px-2.5 py-1 font-medium text-xs ${getStatusColor(order.billingReason)}`}
                        >
                          {formatBillingReason(order.billingReason)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 font-semibold">
                        ${centToDollar(order.totalAmount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="View Order Details"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {data?.orders && data.orders.length > 0 && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-4">
            <Receipt className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium text-sm">
                Total Orders: {data.orders.length}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                Showing all orders for this subscription
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
