'use client';

import { ExternalLink } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
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
import { centToDollar } from '@/utils/price-helper';

interface OrderItem {
  id: string;
  createdAt: string;
  billingReason: string;
  totalAmount: number;
  currency: string;
  status: string;
  productName: string;
}

export default function BillingHistory({ orders }: { orders: OrderItem[] }) {
  const t = useTranslations('billing');

  const getBillingReasonColor = (billingReason: string) => {
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

  const getStatusBadgeVariant = (status: string) => {
    if (status === 'paid') {
      return 'default';
    }
    if (status === 'pending') {
      return 'secondary';
    }
    if (status === 'failed' || status === 'canceled') {
      return 'destructive';
    }
    return 'outline';
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm dark:bg-card/80">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-2xl text-card-foreground">
              {t('order-history')}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Only show at most 10 recent orders
            </p>
          </div>
        </div>
        {orders.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">{t('order-history-desc')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-[120px] uppercase tracking-wider">
                    Order ID
                  </TableHead>
                  <TableHead className="w-[140px] uppercase tracking-wider">
                    Date
                  </TableHead>
                  <TableHead className="min-w-[200px] uppercase tracking-wider">
                    Product
                  </TableHead>
                  <TableHead className="w-[140px] uppercase tracking-wider">
                    Type
                  </TableHead>
                  <TableHead className="w-[120px] text-right uppercase tracking-wider">
                    Amount
                  </TableHead>
                  <TableHead className="w-[120px] uppercase tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="w-[80px] text-center uppercase tracking-wider">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <TableCell className="font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-muted-foreground">
                          {order.id.slice(0, 8)}...
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {format(new Date(order.createdAt), 'MMM d, yyyy')}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {format(new Date(order.createdAt), 'HH:mm')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <p className="truncate font-medium text-sm">
                          {order.productName}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={`border ${getBillingReasonColor(order.billingReason)}`}
                      >
                        {formatBillingReason(order.billingReason)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-sm">
                        {order.currency === 'usd'
                          ? '$'
                          : order.currency.toUpperCase()}{' '}
                        {centToDollar(order.totalAmount)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        variant={getStatusBadgeVariant(order.status)}
                        className="text-xs"
                      >
                        {order.status.charAt(0).toUpperCase() +
                          order.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="View Order Details"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
