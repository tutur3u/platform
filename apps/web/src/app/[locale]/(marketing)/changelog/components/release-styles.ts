import type { ChangeType } from './github-releases';

/**
 * One colour per change type, shared by the filter chips and the feed.
 *
 * Authored literals rather than class names assembled from the type at
 * runtime — Tailwind only sees classes that appear verbatim in the source, and
 * the compile-graph test enforces that for this route.
 */
export const changeTypeStyles: Record<
  ChangeType,
  { chip: string; dot: string; text: string }
> = {
  breaking: {
    chip: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
    dot: 'bg-dynamic-red',
    text: 'text-dynamic-red',
  },
  features: {
    chip: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
    dot: 'bg-dynamic-green',
    text: 'text-dynamic-green',
  },
  fixes: {
    chip: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
    dot: 'bg-dynamic-orange',
    text: 'text-dynamic-orange',
  },
  performance: {
    chip: 'border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan',
    dot: 'bg-dynamic-cyan',
    text: 'text-dynamic-cyan',
  },
  other: {
    chip: 'border-foreground/15 bg-foreground/[0.04] text-foreground/60',
    dot: 'bg-foreground/40',
    text: 'text-foreground/60',
  },
};
