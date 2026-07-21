import { CreditCard, Receipt, TrendingUp } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { CmsCommerceOverview } from '@/lib/commerce-client';

const numberFormatter = new Intl.NumberFormat();

export function CmsHomeCommerce({
  isError,
  isPending,
  onRetry,
  overview,
}: {
  isError: boolean;
  isPending: boolean;
  onRetry: () => void;
  overview: CmsCommerceOverview | null | undefined;
}) {
  const t = useTranslations('external-projects');

  if (isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5">
        <div>
          <p className="font-medium text-sm">{t('epm.commerce_error_title')}</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('epm.commerce_error_description')}
          </p>
        </div>
        <Button onClick={onRetry} size="sm" variant="outline">
          {t('epm.retry_action')}
        </Button>
      </div>
    );
  }

  if (!overview || overview.orders === 0) {
    return (
      <div className="rounded-lg border border-dashed p-5">
        <p className="font-medium text-sm">{t('epm.commerce_empty_title')}</p>
        <p className="mt-1 text-muted-foreground text-sm leading-6">
          {t('epm.commerce_empty_description')}
        </p>
      </div>
    );
  }

  const cards: Array<{ icon: ReactNode; label: string; value: string }> = [
    {
      icon: <TrendingUp className="h-4 w-4" />,
      label: t('epm.commerce_revenue_label'),
      value: numberFormatter.format(overview.revenue),
    },
    {
      icon: <Receipt className="h-4 w-4" />,
      label: t('epm.commerce_orders_label'),
      value: numberFormatter.format(overview.orders),
    },
    {
      icon: <CreditCard className="h-4 w-4" />,
      label: t('epm.commerce_net_label'),
      value: numberFormatter.format(overview.collected),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border/70 bg-background/70 px-4 py-3"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            {card.icon}
            <span className="text-xs">{card.label}</span>
          </div>
          <div className="mt-2 font-semibold text-2xl tabular-nums">
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
