'use client';

import {
  CheckCircle,
  Clock,
  FileText,
  Receipt,
  RefreshCw,
  XCircle,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { centToDollar } from '@/utils/price-helper';

interface OrderItem {
  id: string;
  createdAt: string;
  billingReason: string;
  totalAmount: number;
  originalAmount: number;
  currency: string;
  status: string;
  productName: string;
}

function getSimpleProductName(name: string): string {
  return name
    .replace(/^Tuturuuu\s+Workspace\s+/i, '')
    .replace(/^Tuturuuu\s+/i, '')
    .replace(/\s+(Monthly|Yearly|Annual)$/i, '')
    .trim();
}

export default function BillingHistory({ orders }: { orders: OrderItem[] }) {
  const t = useTranslations('billing');
  const locale = useLocale();
  const dateLocale = locale === 'vi' ? vi : enUS;

  const formatOrderDate = (date: string) =>
    format(new Date(date), 'd MMM, yyyy', { locale: dateLocale });

  const formatOrderTime = (date: string) =>
    format(new Date(date), 'HH:mm', { locale: dateLocale });

  const getBillingReasonConfig = (billingReason: string) => {
    switch (billingReason) {
      case 'purchase':
        return {
          color:
            'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/30',
          icon: CheckCircle,
          label: t('purchase'),
        };
      case 'subscription_create':
        return {
          color: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/30',
          icon: FileText,
          label: t('subscription-create'),
        };
      case 'subscription_cycle':
        return {
          color: 'bg-dynamic-cyan/10 text-dynamic-cyan border-dynamic-cyan/30',
          icon: RefreshCw,
          label: t('subscription-cycle'),
        };
      case 'subscription_update':
        return {
          color:
            'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/30',
          icon: RefreshCw,
          label: t('subscription-update'),
        };
      default:
        return {
          color: 'bg-muted text-muted-foreground border-border',
          icon: FileText,
          label: billingReason
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
        };
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'paid':
        return {
          className:
            'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/30',
          icon: CheckCircle,
          label: t('status-paid'),
        };
      case 'pending':
        return {
          className:
            'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/30',
          icon: Clock,
          label: t('status-pending'),
        };
      case 'failed':
        return {
          className: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/30',
          icon: XCircle,
          label: t('status-failed'),
        };
      case 'canceled':
        return {
          className: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/30',
          icon: XCircle,
          label: t('status-canceled'),
        };
      default:
        return {
          className: 'bg-muted text-muted-foreground border-border',
          icon: FileText,
          label: status.charAt(0).toUpperCase() + status.slice(1),
        };
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
      {/* Header */}
      <div className="border-border/50 border-b p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-xl">{t('order-history')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('order-history-limit')}
            </p>
          </div>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Receipt className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg">{t('no-orders-title')}</h3>
          <p className="mt-1 max-w-sm text-center text-muted-foreground text-sm">
            {t('order-history-desc')}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/30 hover:bg-muted/30">
                <TableHead className="font-semibold text-xs uppercase tracking-wider">
                  {t('date')}
                </TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider">
                  {t('product')}
                </TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider">
                  {t('type')}
                </TableHead>
                <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">
                  {t('amount')}
                </TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider">
                  {t('status')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order, index) => {
                const reasonConfig = getBillingReasonConfig(
                  order.billingReason
                );
                const statusConfig = getStatusConfig(order.status);
                const ReasonIcon = reasonConfig.icon;
                const StatusIcon = statusConfig.icon;
                const hasDiscount =
                  order.originalAmount > 0 &&
                  order.totalAmount < order.originalAmount;

                return (
                  <TableRow
                    key={order.id}
                    className={cn(
                      'group border-border/30 transition-colors hover:bg-muted/30',
                      index % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'
                    )}
                  >
                    <TableCell className="whitespace-nowrap py-4">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {formatOrderDate(order.createdAt)}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {formatOrderTime(order.createdAt)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <span className="font-medium">
                        {getSimpleProductName(order.productName)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-4">
                      <Badge
                        variant="outline"
                        className={cn(
                          'flex w-fit items-center gap-1.5 border font-medium',
                          reasonConfig.color
                        )}
                      >
                        <ReasonIcon className="h-3 w-3" />
                        {reasonConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4 text-right">
                      {hasDiscount ? (
                        <div className="flex flex-col items-end">
                          <span className="text-muted-foreground text-xs line-through">
                            {order.currency === 'usd'
                              ? '$'
                              : order.currency.toUpperCase()}{' '}
                            {centToDollar(order.originalAmount)}
                          </span>
                          <span className="font-semibold text-dynamic-green">
                            {order.currency === 'usd'
                              ? '$'
                              : order.currency.toUpperCase()}{' '}
                            {centToDollar(order.totalAmount)}
                          </span>
                        </div>
                      ) : (
                        <span className="font-semibold">
                          {order.currency === 'usd'
                            ? '$'
                            : order.currency.toUpperCase()}{' '}
                          {centToDollar(order.totalAmount)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-4">
                      <Badge
                        variant="outline"
                        className={cn(
                          'flex w-fit items-center gap-1.5 border font-medium',
                          statusConfig.className
                        )}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
