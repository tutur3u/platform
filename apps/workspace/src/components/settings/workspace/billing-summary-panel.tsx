'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { useLocale, useTranslations } from 'next-intl';
import { getPayBillingUrl } from '@/lib/pay-app-url';
import { loadWorkspaceBillingSummary } from './billing-summary-action';

export function WorkspaceBillingSummaryPanel({
  showTitle = false,
  wsId,
}: {
  /** For standalone routes; the settings dialog renders its own page title. */
  showTitle?: boolean;
  wsId: string;
}) {
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
      <SettingsSection>
        <SettingsSectionMessage
          tone="error"
          action={
            <Button
              onClick={() => summaryQuery.refetch()}
              size="sm"
              variant="outline"
            >
              {t('retry')}
            </Button>
          }
        >
          {t('billing-loading-error')}
        </SettingsSectionMessage>
      </SettingsSection>
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

  const openBilling = (
    <Button asChild size="sm">
      <a
        href={getPayBillingUrl(wsId)}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t('open-billing')}
        <ExternalLink className="ml-2 h-4 w-4" />
      </a>
    </Button>
  );

  return (
    <SettingsSection
      description={t('manage-billing-on-pay')}
      title={showTitle ? t('billing') : undefined}
    >
      {subscription ? (
        <>
          <SettingItemTab
            title={
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span>{subscription.name}</span>
                {subscription.tier && (
                  <Badge variant="outline">{subscription.tier}</Badge>
                )}
                <Badge variant="outline">{subscription.status}</Badge>
                {subscription.cancelAtPeriodEnd && (
                  <Badge variant="destructive">
                    {t('subscription-ending-soon')}
                  </Badge>
                )}
              </div>
            }
          >
            {openBilling}
          </SettingItemTab>
          <SummaryItem
            label={t('subscription-cycle')}
            value={subscription.billingCycle ?? '—'}
          />
          <SummaryItem label={t('next-billing')} value={renewalDate} />
          <SummaryItem label={t('seat-usage')} value={seatUsage} />
        </>
      ) : (
        <SettingItemTab description={t('billing-info')} title={t('no-plan')}>
          {openBilling}
        </SettingItemTab>
      )}
    </SettingsSection>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <SettingItemTab title={label}>
      <span className="text-sm tabular-nums">{value}</span>
    </SettingItemTab>
  );
}
