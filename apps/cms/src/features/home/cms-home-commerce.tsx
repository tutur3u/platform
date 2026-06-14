'use client';

import { useQuery } from '@tanstack/react-query';
import { CreditCard, Receipt, TrendingUp } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

const numberFormatter = new Intl.NumberFormat();

interface CmsCommerceOverview {
  collected: number;
  orders: number;
  revenue: number;
}

/**
 * Revenue snapshot on the CMS dashboard — a deep integration with apps/finance.
 *
 * Reads aggregate sales from the CMS-owned commerce endpoint (which queries
 * finance invoices via the admin client, authorized by the satellite session).
 * Renders nothing when the workspace has no commerce activity yet or the request
 * fails, so content-only sites stay clean and commerce workspaces "light up".
 */
export function CmsHomeCommerce({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('external-projects');
  const overviewQuery = useQuery({
    queryFn: async (): Promise<CmsCommerceOverview | null> => {
      const response = await fetch(
        `/api/v1/commerce/overview?wsId=${encodeURIComponent(workspaceId)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        return null;
      }
      return response.json();
    },
    queryKey: ['cms-commerce-overview', workspaceId],
    retry: false,
    staleTime: 60_000,
  });

  const overview = overviewQuery.data;
  if (!overview || overview.orders === 0) {
    return null;
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
    <section className="rounded-lg border border-border/70 bg-card/75 p-5">
      <h2 className="font-semibold">{t('epm.commerce_snapshot_title')}</h2>
      <p className="mt-1 text-muted-foreground text-sm leading-6">
        {t('epm.commerce_snapshot_description')}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
    </section>
  );
}
