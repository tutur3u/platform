'use client';

import type { ObservabilityResourceSamplingStatus } from '@tuturuuu/internal-api/infrastructure/monitoring';

export type ResourceTone =
  | 'amber'
  | 'blue'
  | 'green'
  | 'muted'
  | 'orange'
  | 'red';

export const resourceToneClasses: Record<
  ResourceTone,
  { dot: string; soft: string; text: string }
> = {
  amber: {
    dot: 'bg-dynamic-yellow',
    soft: 'border-dynamic-yellow/30 bg-dynamic-yellow/10',
    text: 'text-dynamic-yellow',
  },
  blue: {
    dot: 'bg-dynamic-blue',
    soft: 'border-dynamic-blue/30 bg-dynamic-blue/10',
    text: 'text-dynamic-blue',
  },
  green: {
    dot: 'bg-dynamic-green',
    soft: 'border-dynamic-green/30 bg-dynamic-green/10',
    text: 'text-dynamic-green',
  },
  muted: {
    dot: 'bg-muted-foreground',
    soft: 'border-border bg-muted/30',
    text: 'text-muted-foreground',
  },
  orange: {
    dot: 'bg-dynamic-orange',
    soft: 'border-dynamic-orange/30 bg-dynamic-orange/10',
    text: 'text-dynamic-orange',
  },
  red: {
    dot: 'bg-dynamic-red',
    soft: 'border-dynamic-red/30 bg-dynamic-red/10',
    text: 'text-dynamic-red',
  },
};

export function getCpuResourceTone(
  value: number | null | undefined
): ResourceTone {
  if (value == null || !Number.isFinite(value)) return 'muted';
  if (value < 5) return 'green';
  if (value <= 20) return 'amber';
  if (value <= 40) return 'orange';
  return 'red';
}

export function getMemoryResourceTone(
  value: number | null | undefined
): ResourceTone {
  if (value == null || !Number.isFinite(value)) return 'muted';

  const mb = value / 1024 / 1024;
  if (mb < 200) return 'green';
  if (mb <= 500) return 'amber';
  if (mb <= 1024) return 'orange';
  return 'red';
}

export function getSamplingResourceTone(
  status: ObservabilityResourceSamplingStatus
): ResourceTone {
  if (status === 'healthy') return 'green';
  if (status === 'gapped') return 'amber';
  if (status === 'stale') return 'red';
  return 'blue';
}
