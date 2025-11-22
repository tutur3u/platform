'use client';

import {
  Activity,
  AlertTriangle,
  Building2,
  Clock,
  Hash,
  TrendingUp,
  Users,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

interface SummaryStatsProps {
  summary: {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    uniqueUsers: number;
    uniqueChannels: number;
    uniqueWorkspaces: number;
    peakHour: string | null;
    peakHourCount: number;
    avgRequestsPerHour: number;
  };
  isLoading?: boolean;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: 'default' | 'warning' | 'danger' | 'success';
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  variant = 'default',
}: StatCardProps) {
  const variantStyles = {
    default: 'border-border bg-card',
    warning: 'border-dynamic-yellow/30 bg-dynamic-yellow/5',
    danger: 'border-dynamic-red/30 bg-dynamic-red/5',
    success: 'border-dynamic-green/30 bg-dynamic-green/5',
  };

  const iconVariants = {
    default: 'text-muted-foreground',
    warning: 'text-dynamic-yellow',
    danger: 'text-dynamic-red',
    success: 'text-dynamic-green',
  };

  return (
    <div className={`rounded-lg border p-6 ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-medium text-muted-foreground text-sm">{title}</p>
          <p className="mt-2 font-bold text-3xl">{value}</p>
          {subtitle && (
            <p className="mt-1 text-muted-foreground text-xs">{subtitle}</p>
          )}
        </div>
        <div className={`rounded-full p-3 ${iconVariants[variant]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export function SummaryStats({ summary, isLoading }: SummaryStatsProps) {
  const t = useTranslations('realtime-analytics.summary');

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-lg border bg-card"
          />
        ))}
      </div>
    );
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  const errorVariant =
    summary.errorRate > 5
      ? 'danger'
      : summary.errorRate > 1
        ? 'warning'
        : 'default';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('total_requests')}
          value={formatNumber(summary.totalRequests)}
          subtitle={`${formatNumber(summary.avgRequestsPerHour)} ${t('avg_per_hour')}`}
          icon={<Activity className="h-6 w-6" />}
        />
        <StatCard
          title={t('total_errors')}
          value={formatNumber(summary.totalErrors)}
          subtitle={`${summary.errorRate.toFixed(2)}% ${t('error_rate')}`}
          icon={<AlertTriangle className="h-6 w-6" />}
          variant={errorVariant}
        />
        <StatCard
          title={t('unique_users')}
          value={formatNumber(summary.uniqueUsers)}
          icon={<Users className="h-6 w-6" />}
        />
        <StatCard
          title={t('unique_channels')}
          value={formatNumber(summary.uniqueChannels)}
          icon={<Hash className="h-6 w-6" />}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('unique_workspaces')}
          value={formatNumber(summary.uniqueWorkspaces)}
          icon={<Building2 className="h-6 w-6" />}
        />
        <StatCard
          title={t('peak_hour')}
          value={summary.peakHour || '—'}
          subtitle={
            summary.peakHourCount > 0
              ? `${formatNumber(summary.peakHourCount)} ${t('requests')}`
              : undefined
          }
          icon={<Clock className="h-6 w-6" />}
        />
        <StatCard
          title={t('avg_per_hour')}
          value={formatNumber(Math.round(summary.avgRequestsPerHour))}
          icon={<TrendingUp className="h-6 w-6" />}
        />
        <StatCard
          title={t('error_rate_card')}
          value={`${summary.errorRate.toFixed(2)}%`}
          icon={<AlertTriangle className="h-6 w-6" />}
          variant={errorVariant}
        />
      </div>
    </div>
  );
}
