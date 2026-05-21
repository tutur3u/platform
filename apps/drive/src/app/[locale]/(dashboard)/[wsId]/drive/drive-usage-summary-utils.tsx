'use client';

import { formatBytes } from '@tuturuuu/utils/format';

export function getUsageTone(usagePercentage: number) {
  if (usagePercentage >= 95) {
    return {
      bar: 'bg-dynamic-red',
      badge: 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red',
      card: 'from-dynamic-red/8 via-dynamic-orange/8 to-background',
      label: 'critical',
    } as const;
  }

  if (usagePercentage >= 80) {
    return {
      bar: 'bg-dynamic-orange',
      badge:
        'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
      card: 'from-dynamic-orange/8 via-dynamic-yellow/8 to-background',
      label: 'warning',
    } as const;
  }

  return {
    bar: 'bg-dynamic-blue',
    badge: 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
    card: 'from-dynamic-blue/8 via-dynamic-cyan/8 to-background',
    label: 'healthy',
  } as const;
}

export function getUsageStateLabelKey(
  label: 'healthy' | 'warning' | 'critical'
) {
  switch (label) {
    case 'critical':
      return 'storage_state_critical';
    case 'warning':
      return 'storage_state_warning';
    default:
      return 'storage_state_healthy';
  }
}

export function FileMetric({
  label,
  name,
  size,
}: {
  label: string;
  name: string;
  size?: number | null;
}) {
  return (
    <div className="rounded-[24px] border border-dynamic-border/80 bg-muted/20 p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
        {label}
      </p>
      <p className="mt-2 font-semibold text-lg">
        {size ? formatBytes(size) : '-'}
      </p>
      <p className="mt-1 truncate text-muted-foreground text-xs">{name}</p>
    </div>
  );
}
