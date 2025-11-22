'use client';

import { BarChart3, PieChart } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { DistributionChart } from './distribution-chart';

interface RequestBreakdownProps {
  requestsByKind: Record<string, number>;
  errorBreakdown: Array<{
    kind: string;
    errors: number;
    total: number;
    errorRate: number;
  }>;
  isLoading?: boolean;
}

export function RequestBreakdown({
  requestsByKind,
  errorBreakdown,
  isLoading,
}: RequestBreakdownProps) {
  const t = useTranslations('realtime-analytics.breakdown');

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-lg border bg-card" />
        <div className="h-64 animate-pulse rounded-lg border bg-card" />
      </div>
    );
  }

  const totalRequests = Object.values(requestsByKind).reduce(
    (sum, count) => sum + count,
    0
  );
  const requestTypes = Object.entries(requestsByKind)
    .map(([kind, count]) => ({
      kind,
      count,
      percentage: totalRequests > 0 ? (count / totalRequests) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const maxCount = Math.max(...requestTypes.map((r) => r.count), 1);

  return (
    <div className="space-y-4">
      {/* Request Types Distribution Chart */}
      <div className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="flex items-center gap-2">
            <PieChart className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold text-lg">{t('request_types')}</h3>
          </div>
          <p className="text-muted-foreground text-sm">
            {t('request_types_desc')}
          </p>
        </div>
        <div className="p-6">
          {requestTypes.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm">
              {t('no_data')}
            </p>
          ) : (
            <DistributionChart
              data={requestTypes.map((item) => ({
                label: item.kind,
                value: item.count,
              }))}
              title={t('total_requests_chart')}
              total={totalRequests}
            />
          )}
        </div>
      </div>

      {/* Detailed Request Types Table */}
      <div className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold text-lg">
              {t('request_types_detail')}
            </h3>
          </div>
          <p className="text-muted-foreground text-sm">
            {t('request_types_detail_desc')}
          </p>
        </div>
        <div className="p-4">
          {requestTypes.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm">
              {t('no_data')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b text-left">
                  <tr>
                    <th className="pb-2 font-medium text-sm">{t('rank')}</th>
                    <th className="pb-2 font-medium text-sm">{t('kind')}</th>
                    <th className="pb-2 text-right font-medium text-sm">
                      {t('requests')}
                    </th>
                    <th className="pb-2 text-right font-medium text-sm">
                      {t('percentage')}
                    </th>
                    <th className="pb-2 text-right font-medium text-sm">
                      {t('visual')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requestTypes.map((item, index) => (
                    <tr key={item.kind} className="border-b last:border-0">
                      <td className="py-3 font-mono text-muted-foreground text-sm">
                        #{index + 1}
                      </td>
                      <td className="py-3 font-medium">{item.kind}</td>
                      <td className="py-3 text-right font-mono text-sm">
                        {formatNumber(item.count)}
                      </td>
                      <td className="py-3 text-right font-mono font-semibold text-sm">
                        {item.percentage.toFixed(1)}%
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-dynamic-blue transition-all"
                              style={{
                                width: `${(item.count / maxCount) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Error Breakdown */}
      <div className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold text-lg">{t('error_breakdown')}</h3>
          </div>
          <p className="text-muted-foreground text-sm">
            {t('error_breakdown_desc')}
          </p>
        </div>
        <div className="p-4">
          {errorBreakdown.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-medium text-dynamic-green">{t('no_errors')}</p>
              <p className="text-muted-foreground text-sm">
                {t('no_errors_desc')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b text-left">
                  <tr>
                    <th className="pb-2 font-medium text-sm">{t('rank')}</th>
                    <th className="pb-2 font-medium text-sm">{t('kind')}</th>
                    <th className="pb-2 text-right font-medium text-sm">
                      {t('errors')}
                    </th>
                    <th className="pb-2 text-right font-medium text-sm">
                      {t('total')}
                    </th>
                    <th className="pb-2 text-right font-medium text-sm">
                      {t('error_rate')}
                    </th>
                    <th className="pb-2 text-right font-medium text-sm">
                      {t('visual')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {errorBreakdown.map((item, index) => {
                    const errorRateVariant =
                      item.errorRate > 5
                        ? 'text-dynamic-red'
                        : item.errorRate > 1
                          ? 'text-dynamic-yellow'
                          : '';

                    return (
                      <tr key={item.kind} className="border-b last:border-0">
                        <td className="py-3 font-mono text-muted-foreground text-sm">
                          #{index + 1}
                        </td>
                        <td className="py-3 font-medium">{item.kind}</td>
                        <td className="py-3 text-right font-mono text-sm">
                          {formatNumber(item.errors)}
                        </td>
                        <td className="py-3 text-right font-mono text-sm">
                          {formatNumber(item.total)}
                        </td>
                        <td
                          className={`py-3 text-right font-mono font-semibold text-sm ${errorRateVariant}`}
                        >
                          {item.errorRate.toFixed(2)}%
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full transition-all ${
                                  item.errorRate > 5
                                    ? 'bg-dynamic-red'
                                    : item.errorRate > 1
                                      ? 'bg-dynamic-yellow'
                                      : 'bg-dynamic-green'
                                }`}
                                style={{
                                  width: `${Math.min(item.errorRate * 10, 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
