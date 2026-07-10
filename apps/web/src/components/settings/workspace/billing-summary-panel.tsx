'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import { getPayBillingUrl } from '@/lib/pay-app-url';
import { loadWorkspaceBillingSummary } from './billing-summary-action';

export function WorkspaceBillingSummaryPanel({ wsId }: { wsId: string }) {
  const locale = useLocale();
  const t = useTranslations('billing');
  const summaryQuery = useQuery({
    queryFn: () => loadWorkspaceBillingSummary(wsId),
    queryKey: ['pay-workspace-billing-summary', wsId],
    staleTime: 30_000,
  });

  if (summaryQuery.isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (summaryQuery.isError) {
    return (
      <div className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/10 p-5">
        <p className="font-medium text-destructive">
          {t('billing-loading-error')}
        </p>
        <Button
          onClick={() => summaryQuery.refetch()}
          size="sm"
          variant="outline"
        >
          {t('retry')}
        </Button>
      </div>
    );
  }

  const subscription = summaryQuery.data?.subscription ?? null;
  const renewalDate = subscription?.currentPeriodEnd
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
        new Date(subscription.currentPeriodEnd)
      )
    : '—';
  const seatUsage = subscription
    ? `${subscription.seatCount ?? '—'} / ${subscription.maxSeats ?? '∞'}`
    : '—';

  return (
    <section className="space-y-5 rounded-lg border border-border bg-background p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-xl">{t('billing')}</h2>
          <p className="max-w-2xl text-muted-foreground text-sm">
            {t('manage-billing-on-pay')}
          </p>
        </div>
        <Button asChild>
          <a href={getPayBillingUrl(wsId)} rel="noreferrer">
            {t('open-billing')}
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>

      {subscription ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-semibold text-lg">{subscription.name}</p>
            {subscription.tier && (
              <Badge variant="secondary">{subscription.tier}</Badge>
            )}
            <Badge variant="outline">{subscription.status}</Badge>
            {subscription.cancelAtPeriodEnd && (
              <Badge variant="destructive">
                {t('subscription-ending-soon')}
              </Badge>
            )}
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            <SummaryItem
              label={t('subscription-cycle')}
              value={subscription.billingCycle ?? '—'}
            />
            <SummaryItem label={t('next-billing')} value={renewalDate} />
            <SummaryItem label={t('seat-usage')} value={seatUsage} />
          </dl>
        </div>
      ) : (
        <div className="rounded-md border border-border border-dashed p-5">
          <p className="font-medium">{t('no-plan')}</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('billing-info')}
          </p>
        </div>
      )}
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-4">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-sm">{value}</dd>
    </div>
  );
}
