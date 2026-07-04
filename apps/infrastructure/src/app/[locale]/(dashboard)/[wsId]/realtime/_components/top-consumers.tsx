'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, TrendingUp } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface TopConsumer {
  id: string;
  name: string;
  requests: number;
  errors: number;
  errorRate: number;
}

interface TopConsumersTableProps {
  title: string;
  data: TopConsumer[];
  type: 'workspace' | 'channel' | 'user';
  isLoading?: boolean;
}

type SortField = 'name' | 'requests' | 'errors' | 'errorRate';
type SortDirection = 'asc' | 'desc';

export function TopConsumersTable({
  title,
  data,
  type,
  isLoading,
}: TopConsumersTableProps) {
  const t = useTranslations('realtime-analytics.top_consumers');
  const [sortField, setSortField] = useState<SortField>('requests');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    const multiplier = sortDirection === 'asc' ? 1 : -1;

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return aValue.localeCompare(bValue) * multiplier;
    }

    return ((aValue as number) - (bValue as number)) * multiplier;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 inline h-4 w-4 opacity-50" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-1 inline h-4 w-4" />
    ) : (
      <ArrowDown className="ml-1 inline h-4 w-4" />
    );
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  // Calculate total requests for percentage calculation
  const totalRequests = useMemo(
    () => data.reduce((sum, item) => sum + item.requests, 0),
    [data]
  );

  // Add percentage to sorted data
  const sortedDataWithPercentage = useMemo(() => {
    return sortedData.map((item) => ({
      ...item,
      percentage: totalRequests > 0 ? (item.requests / totalRequests) * 100 : 0,
    }));
  }, [sortedData, totalRequests]);

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="mb-2 h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h3 className="font-semibold text-lg">{title}</h3>
        </div>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">{t('no_data')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg">{title}</h3>
            <p className="text-muted-foreground text-sm">
              {t('showing_top', { count: sortedDataWithPercentage.length })}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-muted-foreground text-sm">
              {formatNumber(totalRequests)} {t('total_requests')}
            </span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left">
                <button
                  type="button"
                  onClick={() => handleSort('name')}
                  className="font-medium text-sm hover:underline"
                >
                  {t(`${type}_name`)}
                  <SortIcon field="name" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('requests')}
                  className="font-medium text-sm hover:underline"
                >
                  {t('requests')}
                  <SortIcon field="requests" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <span className="font-medium text-sm">{t('percentage')}</span>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('errors')}
                  className="font-medium text-sm hover:underline"
                >
                  {t('errors')}
                  <SortIcon field="errors" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('errorRate')}
                  className="font-medium text-sm hover:underline"
                >
                  {t('error_rate')}
                  <SortIcon field="errorRate" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedDataWithPercentage.map((item, index) => {
              const errorRateVariant =
                item.errorRate > 5
                  ? 'text-dynamic-red'
                  : item.errorRate > 1
                    ? 'text-dynamic-yellow'
                    : '';

              return (
                <tr
                  key={item.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-muted-foreground text-xs">
                        #{index + 1}
                      </span>
                      <span className="font-medium">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatNumber(item.requests)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-dynamic-blue transition-all"
                          style={{
                            width: `${Math.min(item.percentage, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="font-mono font-semibold text-sm">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatNumber(item.errors)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono font-semibold ${errorRateVariant}`}
                  >
                    {item.errorRate.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
