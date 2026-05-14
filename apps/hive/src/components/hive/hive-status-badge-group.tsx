'use client';

import { Bot, Box, Layers3, Radio, UsersRound } from '@tuturuuu/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import type { HiveNpc, HiveWorldData } from '@/engine/types';
import type { HiveRealtimeStatus } from '@/realtime/hive-realtime-client';

type HiveStatusBadgeGroupProps = {
  npcs: HiveNpc[];
  presenceCount: number;
  realtimeStatus: HiveRealtimeStatus;
  world: HiveWorldData;
};

type StatusBadgeItem = {
  active?: boolean;
  compactValue?: string;
  icon: ComponentType<{ className?: string }>;
  key: string;
  label: string;
  tone?: 'green' | 'muted' | 'yellow';
  value: string;
};

export function HiveStatusBadgeGroup({
  npcs,
  presenceCount,
  realtimeStatus,
  world,
}: HiveStatusBadgeGroupProps) {
  const t = useTranslations('studio.chrome');
  const connected = realtimeStatus === 'connected';
  const realtimeLabel = connected ? t('realtime') : realtimeStatus;
  const items: StatusBadgeItem[] = [
    {
      active: connected,
      icon: Radio,
      key: 'realtime',
      label: t('realtime_status', { status: realtimeLabel }),
      tone: connected ? 'green' : 'yellow',
      value: realtimeLabel,
    },
    {
      compactValue: world.blocks.length.toLocaleString(),
      icon: Layers3,
      key: 'blocks',
      label: t('blocks_count', { count: world.blocks.length }),
      value: world.blocks.length.toLocaleString(),
    },
    {
      compactValue: world.objects.length.toLocaleString(),
      icon: Box,
      key: 'objects',
      label: t('objects_count', { count: world.objects.length }),
      value: world.objects.length.toLocaleString(),
    },
    {
      compactValue: npcs.length.toLocaleString(),
      icon: Bot,
      key: 'npcs',
      label: t('npcs_count', { count: npcs.length }),
      value: npcs.length.toLocaleString(),
    },
    {
      compactValue: presenceCount.toLocaleString(),
      icon: UsersRound,
      key: 'presence',
      label: t('online_count', { count: presenceCount }),
      value: presenceCount.toLocaleString(),
    },
  ];

  return (
    <div className="group pointer-events-auto relative min-h-9 max-w-[calc(100vw-8rem)] text-xs drop-shadow-sm">
      <div className="visible flex h-9 items-center gap-1 rounded-lg border border-border/70 bg-background/78 px-2 font-medium tabular-nums shadow-foreground/10 shadow-lg ring-1 ring-foreground/5 backdrop-blur-xl transition-[opacity,transform,visibility] duration-300 ease-out group-hover:invisible group-hover:-translate-y-1 group-hover:scale-95 group-hover:opacity-0">
        {items.map((item) => (
          <CompactStatusItem item={item} key={item.key} />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 flex translate-y-1 scale-95 flex-wrap items-center gap-1.5 opacity-0 transition-[opacity,transform,visibility] duration-300 ease-out group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100"
      >
        {items.map((item) => (
          <StatusChip item={item} key={item.key} />
        ))}
      </div>
    </div>
  );
}

function CompactStatusItem({ item }: { item: StatusBadgeItem }) {
  const Icon = item.icon;

  return (
    <span
      aria-label={item.label}
      className={[
        'inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 transition-[background-color,color,transform] duration-200 ease-out',
        getCompactToneClass(item.tone),
      ].join(' ')}
      role="status"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {item.compactValue ? <span>{item.compactValue}</span> : null}
    </span>
  );
}

function StatusChip({ item }: { item: StatusBadgeItem }) {
  const Icon = item.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={[
            'inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg border bg-background/86 px-2.5 font-medium tabular-nums shadow-foreground/10 shadow-lg ring-1 ring-foreground/5 backdrop-blur-xl transition-[background-color,border-color,color,transform] duration-200 ease-out hover:-translate-y-0.5',
            item.active
              ? 'border-dynamic-green/45 text-dynamic-green'
              : getExpandedToneClass(item.tone),
          ].join(' ')}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span>{item.value}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function getCompactToneClass(tone: StatusBadgeItem['tone']) {
  if (tone === 'green') {
    return 'text-dynamic-green';
  }

  if (tone === 'yellow') {
    return 'text-dynamic-yellow';
  }

  return 'text-muted-foreground';
}

function getExpandedToneClass(tone: StatusBadgeItem['tone']) {
  if (tone === 'yellow') {
    return 'border-dynamic-yellow/45 text-dynamic-yellow';
  }

  return 'border-border/70 text-muted-foreground';
}
