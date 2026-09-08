'use client';
import { useQuery } from '@tanstack/react-query';
import { Cloud, ExternalLink, Info } from '@tuturuuu/icons';
import { getMeetRoomCosts } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
export function CloudflareCosts({ meetingId }: { meetingId: string }) {
  const t = useTranslations('meet.call');
  const query = useQuery({
    queryKey: ['meet-room-costs', meetingId],
    queryFn: () => getMeetRoomCosts(meetingId),
    refetchInterval: 15000,
    retry: false,
  });
  const data = query.data,
    usage = data?.cloudflare;
  const usd = (amount: number) => `$${amount.toFixed(6)}`;
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Cloud className="size-4" />
        <h3 className="flex-1 font-medium text-sm">Cloudflare</h3>
        <Badge variant="outline">{t('estimated_partial')}</Badge>
      </div>
      <p className="text-muted-foreground text-xs">
        {t('cloudflare_cost_hint')}
      </p>
      {!usage ? (
        <p role="status" className="text-muted-foreground text-xs">
          {t('cost_unavailable')}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <dt>{t('sfu_egress')}</dt>
            <dd className="text-right font-mono">{usd(usage.sfuEgressUsd)}</dd>
            <dt>{t('received_data')}</dt>
            <dd className="text-right tabular-nums">
              {(usage.receivedBytes / 1_000_000_000).toFixed(4)} GB
            </dd>
            <dt>{t('durable_requests')}</dt>
            <dd className="text-right font-mono">
              {usd(usage.durableRequestsUsd)}
            </dd>
            <dt>{t('reporting_devices')}</dt>
            <dd className="text-right tabular-nums">
              {usage.reportingDevices} / {usage.devices}
            </dd>
            <dt>{t('storage_writes')}</dt>
            <dd className="text-right tabular-nums">
              {usage.storageWrites.toLocaleString()}
            </dd>
            <dt>{t('cloudflare_other_costs')}</dt>
            <dd className="text-right text-muted-foreground">
              {t('unallocated')}
            </dd>
          </dl>
          <p className="flex gap-2 rounded-lg bg-muted p-3 text-muted-foreground text-xs">
            <Info className="size-4 shrink-0" />
            {t('cloudflare_missing_costs')}
          </p>
          {!!usage.limitedReports && (
            <p role="status" className="text-muted-foreground text-xs">
              {t('cost_reports_limited', { count: usage.limitedReports })}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            {t('pricing_date', { date: usage.pricingDate })}
          </p>
        </>
      )}
      {data && (
        <p className="text-xs">
          Mira · {usd(data.miraCostUsd)} ·{' '}
          {t('mira_requests', { count: data.miraRequests })}
          {data.miraUnpriced
            ? ` · ${t('unpriced_requests', { count: data.miraUnpriced })}`
            : ''}
        </p>
      )}
      <a
        href="https://developers.cloudflare.com/realtime/sfu/pricing/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs underline"
      >
        {t('cloudflare_pricing')}
        <ExternalLink className="size-3" />
      </a>
    </section>
  );
}
