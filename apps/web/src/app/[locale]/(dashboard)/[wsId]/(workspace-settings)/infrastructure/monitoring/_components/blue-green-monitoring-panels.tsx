'use client';

import {
  Activity,
  Clock,
  Gauge,
  GitBranch,
  HardDrive,
  Network,
  Radio,
  SquareStack,
  TriangleAlert,
} from '@tuturuuu/icons';
import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import {
  MetricBlock,
  StatusBadge,
} from './blue-green-monitoring-panel-primitives';

export {
  DeploymentLedger,
  RolloutStagePanel,
  TrafficPeriodsPanel,
} from './blue-green-monitoring-rollout-panels';

import {
  formatClockTime,
  formatDateTime,
  formatDuration,
  formatRelativeTime,
  getColorTranslationKey,
  getRuntimeStateTranslationKey,
} from './formatters';

export function RuntimeTopologyPanel({
  snapshot,
}: {
  snapshot: BlueGreenMonitoringSnapshot;
}) {
  const t = useTranslations('blue-green-monitoring');
  const activeColorKey = getColorTranslationKey(snapshot.runtime.activeColor);
  const standbyColorKey = getColorTranslationKey(snapshot.runtime.standbyColor);
  const runtimeStateKey = getRuntimeStateTranslationKey(snapshot.runtime.state);
  const rows = [
    {
      icon: <Radio className="h-4 w-4" />,
      label: t('runtime.active_color'),
      value: activeColorKey
        ? t(activeColorKey)
        : (snapshot.runtime.activeColor ?? t('states.none')),
    },
    {
      icon: <SquareStack className="h-4 w-4" />,
      label: t('runtime.standby_color'),
      value: standbyColorKey
        ? t(standbyColorKey)
        : (snapshot.runtime.standbyColor ?? t('states.none')),
    },
    {
      icon: <Activity className="h-4 w-4" />,
      label: t('runtime.live_colors'),
      value:
        snapshot.runtime.liveColors.length > 0
          ? snapshot.runtime.liveColors
              .map((color) => {
                const colorKey = getColorTranslationKey(color);
                return colorKey ? t(colorKey) : color;
              })
              .join(' / ')
          : t('states.none'),
    },
    {
      icon: <Gauge className="h-4 w-4" />,
      label: t('runtime.runtime_state'),
      value: t(runtimeStateKey),
    },
    {
      icon: <HardDrive className="h-4 w-4" />,
      label: t('runtime.deployment_stamp'),
      value: snapshot.runtime.deploymentStamp ?? '—',
    },
    {
      icon: <Clock className="h-4 w-4" />,
      label: t('runtime.activated_at'),
      value: formatDateTime(snapshot.runtime.activatedAt),
    },
  ];

  return (
    <div className="rounded-[2rem] border border-border/60 bg-background/70 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('panels.runtime')}
          </p>
          <h3 className="mt-1 font-semibold text-lg">{t('panels.topology')}</h3>
        </div>
        <StatusBadge label={t(runtimeStateKey)} />
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 rounded-2xl border border-border/50 bg-background/80 px-3 py-2.5"
          >
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              {row.icon}
              <span>{row.label}</span>
            </div>
            <span className="max-w-[55%] truncate text-right font-medium text-sm">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WatcherCadencePanel({
  watcher,
}: {
  watcher: BlueGreenMonitoringSnapshot['watcher'];
}) {
  const t = useTranslations('blue-green-monitoring');
  const lastResultStatus =
    typeof watcher.lastResult?.status === 'string'
      ? watcher.lastResult.status
      : t('states.none');

  return (
    <div className="rounded-[2rem] border border-border/60 bg-background/70 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('panels.watcher')}
          </p>
          <h3 className="mt-1 font-semibold text-lg">{t('panels.cadence')}</h3>
        </div>
        <StatusBadge label={t(`watcher_health.${watcher.health}`)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricBlock
          icon={<GitBranch className="h-4 w-4" />}
          label={t('watcher.branch')}
          value={watcher.target?.branch ?? watcher.lock?.branch ?? '—'}
        />
        <MetricBlock
          icon={<Network className="h-4 w-4" />}
          label={t('watcher.upstream')}
          value={
            watcher.target?.upstreamRef ?? watcher.lock?.upstreamRef ?? '—'
          }
        />
        <MetricBlock
          icon={<Clock className="h-4 w-4" />}
          label={t('watcher.last_check')}
          value={formatRelativeTime(watcher.lastCheckAt)}
          meta={formatClockTime(watcher.lastCheckAt)}
        />
        <MetricBlock
          icon={<Clock className="h-4 w-4" />}
          label={t('watcher.next_check')}
          value={formatRelativeTime(watcher.nextCheckAt)}
          meta={formatClockTime(watcher.nextCheckAt)}
        />
        <MetricBlock
          icon={<Activity className="h-4 w-4" />}
          label={t('watcher.interval')}
          value={formatDuration(watcher.intervalMs)}
        />
        <MetricBlock
          icon={<Gauge className="h-4 w-4" />}
          label={t('watcher.last_result')}
          value={lastResultStatus}
        />
      </div>

      {watcher.args.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-border/60 bg-background/80 p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
            {t('watcher.args')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {watcher.args.map((arg) => (
              <Badge key={arg} variant="outline" className="rounded-full">
                {arg}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EventStreamPanel({
  watcher,
}: {
  watcher: BlueGreenMonitoringSnapshot['watcher'];
}) {
  const t = useTranslations('blue-green-monitoring');

  return (
    <div className="rounded-[2rem] border border-border/60 bg-background/70 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('panels.events')}
          </p>
          <h3 className="mt-1 font-semibold text-lg">
            {t('panels.signal_feed')}
          </h3>
        </div>
        <Badge variant="secondary" className="rounded-full">
          {watcher.events.length}
        </Badge>
      </div>

      {watcher.events.length === 0 ? (
        <div className="rounded-2xl border border-border/60 border-dashed bg-background/60 p-6 text-center text-muted-foreground text-sm">
          {t('empty.events')}
        </div>
      ) : (
        <ScrollArea className="h-[360px] pr-3">
          <div className="space-y-3">
            {watcher.events.map((event, index) => (
              <div
                key={`${event.time}-${index}`}
                className="rounded-2xl border border-border/50 bg-background/80 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {event.level === 'error' ? (
                      <TriangleAlert className="h-4 w-4 text-dynamic-red" />
                    ) : event.level === 'warn' ? (
                      <TriangleAlert className="h-4 w-4 text-dynamic-orange" />
                    ) : (
                      <Radio className="h-4 w-4 text-dynamic-blue" />
                    )}
                    <span className="font-medium text-sm">{event.message}</span>
                  </div>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {formatClockTime(event.time)}
                  </span>
                </div>
                <p className="mt-2 text-muted-foreground text-xs">
                  {formatRelativeTime(event.time)}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
