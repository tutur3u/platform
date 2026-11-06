/**
 * Semantic status tones for operational surfaces. `unknown` is distinct from
 * `neutral`: it marks a value the system cannot currently vouch for (stale or
 * missing telemetry, an unreachable worker), so it must never read as healthy.
 */
export type OpsTone =
  | 'positive'
  | 'info'
  | 'warning'
  | 'critical'
  | 'neutral'
  | 'unknown';

export interface OpsToneClasses {
  border: string;
  dot: string;
  fill: string;
  soft: string;
  text: string;
}

export const opsToneClasses: Record<OpsTone, OpsToneClasses> = {
  critical: {
    border: 'border-dynamic-red/40',
    dot: 'bg-dynamic-red',
    fill: 'bg-dynamic-red',
    soft: 'border-dynamic-red/30 bg-dynamic-red/10',
    text: 'text-dynamic-red',
  },
  info: {
    border: 'border-dynamic-blue/40',
    dot: 'bg-dynamic-blue',
    fill: 'bg-dynamic-blue',
    soft: 'border-dynamic-blue/30 bg-dynamic-blue/10',
    text: 'text-dynamic-blue',
  },
  neutral: {
    border: 'border-border',
    dot: 'bg-muted-foreground',
    fill: 'bg-muted-foreground',
    soft: 'border-border bg-muted/40',
    text: 'text-muted-foreground',
  },
  positive: {
    border: 'border-dynamic-green/40',
    dot: 'bg-dynamic-green',
    fill: 'bg-dynamic-green',
    soft: 'border-dynamic-green/30 bg-dynamic-green/10',
    text: 'text-dynamic-green',
  },
  unknown: {
    border: 'border-dashed border-muted-foreground/50',
    dot: 'border border-muted-foreground bg-transparent',
    fill: 'bg-muted-foreground/30',
    soft: 'border-dashed border-muted-foreground/50 bg-transparent',
    text: 'text-muted-foreground',
  },
  warning: {
    border: 'border-dynamic-yellow/40',
    dot: 'bg-dynamic-yellow',
    fill: 'bg-dynamic-yellow',
    soft: 'border-dynamic-yellow/30 bg-dynamic-yellow/10',
    text: 'text-dynamic-yellow',
  },
};

/** Maps a utilisation percentage onto pressure tones; null stays unknown. */
export function getPressureTone(
  percent: number | null,
  { critical = 90, warning = 75 }: { critical?: number; warning?: number } = {}
): OpsTone {
  if (percent === null || !Number.isFinite(percent)) return 'unknown';
  if (percent >= critical) return 'critical';
  if (percent >= warning) return 'warning';
  return 'positive';
}
