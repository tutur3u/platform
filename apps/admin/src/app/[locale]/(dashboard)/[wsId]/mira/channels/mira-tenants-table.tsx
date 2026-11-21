'use client';

import type {
  MiraOperatorMetrics,
  MiraOperatorTenantRow,
} from '@tuturuuu/internal-api/infrastructure/mira';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime, formatMicroUsd } from './mira-channels-format';

export function MiraTenantsTable({
  metrics,
  tenants,
}: {
  metrics: MiraOperatorMetrics;
  tenants: MiraOperatorTenantRow[];
}) {
  const t = useTranslations('mira-channels');
  const locale = useLocale();
  const metricFor = (wsId: string) =>
    metrics.status === 'ok' ? metrics.byWorkspace[wsId] : undefined;
  const unavailable = t('metrics_unavailable');

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('workspace')}</TableHead>
            <TableHead>{t('state')}</TableHead>
            <TableHead>{t('channels')}</TableHead>
            <TableHead>{t('last_error')}</TableHead>
            <TableHead>{t('errors_7d')}</TableHead>
            <TableHead>{t('p95_first_token')}</TableHead>
            <TableHead>{t('cost_7d')}</TableHead>
            <TableHead>{t('replies_7d')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.length === 0 ? (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={8}>
                {t('empty_tenants')}
              </TableCell>
            </TableRow>
          ) : (
            tenants.map((tenant) => {
              const metric = metricFor(tenant.wsId);
              return (
                <TableRow key={tenant.wsId}>
                  <TableCell className="font-mono text-xs">
                    {tenant.wsId}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={tenant.enabled ? 'default' : 'outline'}>
                        {tenant.enabled ? t('enabled') : t('disabled')}
                      </Badge>
                      {tenant.stopReasons.map((reason) => (
                        <Badge key={reason} variant="destructive">
                          {t(`reasons.${reason}`)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {t('channel_counts', {
                      stopped: tenant.stoppedChannelCount,
                      total: tenant.channelCount,
                    })}
                  </TableCell>
                  <TableCell>
                    {formatDateTime(tenant.lastErrorAt, locale) ?? t('none')}
                  </TableCell>
                  <TableCell>{metric?.errorCount7d ?? unavailable}</TableCell>
                  <TableCell>
                    {metric?.p95FirstTokenMs != null
                      ? t('milliseconds', { value: metric.p95FirstTokenMs })
                      : unavailable}
                  </TableCell>
                  <TableCell>
                    {formatMicroUsd(tenant.costMicroUsd7d, locale)}
                  </TableCell>
                  <TableCell>{tenant.replies7d}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
