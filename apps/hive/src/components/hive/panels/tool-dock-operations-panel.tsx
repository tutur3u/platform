'use client';

import {
  Bot,
  Box,
  CircleDollarSign,
  Layers3,
  Radio,
  Sprout,
  UsersRound,
  Warehouse,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import type { HiveRealtimeStatus } from '@/realtime/hive-realtime-client';

export type ToolDockOperationsStats = {
  cropsCount: number;
  currency: number;
  eventsCount: number;
  presenceCount: number;
  realtimeStatus: HiveRealtimeStatus;
  revision: number;
  serverName?: string | null;
  syncNotice?: string | null;
  warehousesCount: number;
  worldCounts: {
    blocks: number;
    npcs: number;
    objects: number;
  };
};

type ToolDockOperationsPanelProps = ToolDockOperationsStats;

type OperationMetric = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
};

export function ToolDockOperationsPanel({
  cropsCount,
  currency,
  eventsCount,
  presenceCount,
  realtimeStatus,
  revision,
  serverName,
  syncNotice,
  warehousesCount,
  worldCounts,
}: ToolDockOperationsPanelProps) {
  const t = useTranslations('studio.dock');
  const metrics: OperationMetric[] = [
    {
      icon: Layers3,
      label: t('operations_blocks'),
      value: worldCounts.blocks.toLocaleString(),
    },
    {
      icon: Box,
      label: t('operations_objects'),
      value: worldCounts.objects.toLocaleString(),
    },
    {
      icon: Bot,
      label: t('operations_npcs'),
      value: worldCounts.npcs.toLocaleString(),
    },
    {
      icon: UsersRound,
      label: t('operations_online'),
      value: presenceCount.toLocaleString(),
    },
    {
      icon: Sprout,
      label: t('operations_crops'),
      value: cropsCount.toLocaleString(),
    },
    {
      icon: Warehouse,
      label: t('operations_warehouses'),
      value: warehousesCount.toLocaleString(),
    },
    {
      icon: CircleDollarSign,
      label: t('operations_currency'),
      value: currency.toLocaleString(),
    },
    {
      icon: Radio,
      label: t('operations_events'),
      value: eventsCount.toLocaleString(),
    },
  ];

  return (
    <>
      <div className="my-1 w-px shrink-0 bg-border" />
      <section
        aria-label={t('live_operations')}
        className="flex max-w-[54vw] items-center gap-2 overflow-x-auto"
      >
        <div className="min-w-36 rounded-md border border-border bg-background px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            {t('live_operations')}
          </p>
          <p className="font-semibold text-foreground text-xs">
            {serverName ?? t('operations_no_server')}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span
              className={[
                'h-1.5 w-1.5 rounded-full',
                realtimeStatus === 'connected'
                  ? 'bg-dynamic-green'
                  : 'bg-dynamic-yellow',
              ].join(' ')}
            />
            <span>{t(`realtime_${realtimeStatus}`)}</span>
          </div>
        </div>
        <OperationMetricCard
          icon={Radio}
          label={t('operations_revision')}
          value={revision.toLocaleString()}
        />
        {metrics.map((metric) => (
          <OperationMetricCard
            icon={metric.icon}
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
        <div className="min-w-36 rounded-md border border-border bg-background px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            {t('operations_last_sync')}
          </p>
          <p className="truncate font-medium text-foreground text-xs">
            {syncNotice ?? t('operations_sync_idle')}
          </p>
        </div>
      </section>
    </>
  );
}

function OperationMetricCard({ icon: Icon, label, value }: OperationMetric) {
  return (
    <div className="grid min-w-24 grid-cols-[auto_1fr] items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-dynamic-green" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate font-semibold text-foreground text-xs tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}
