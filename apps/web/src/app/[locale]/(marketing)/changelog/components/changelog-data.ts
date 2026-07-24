import {
  AlertTriangle,
  Bug,
  type LucideIcon,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from '@tuturuuu/icons/lucide';

/**
 * Shape, taxonomy and derived figures for the changelog.
 *
 * The category table used to be declared twice — once on the index and once on
 * the entry page — which is how the two drifted: the same release wore a
 * hand-rolled chip in the list and a Radix `Badge` on its own page. One table,
 * one look, and the labels now come from the message bundle instead of being
 * hardcoded English on a page that is otherwise translated.
 */

export interface ChangelogEntry {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  category: string;
  version: string | null;
  cover_image_url: string | null;
  published_at: string | null;
}

export const categoryKeys = [
  'feature',
  'improvement',
  'bugfix',
  'breaking',
  'security',
  'performance',
] as const;

export type CategoryKey = (typeof categoryKeys)[number];

export interface CategoryStyle {
  icon: LucideIcon;
  /** Pill worn by the entry. */
  chip: string;
  /** Timeline node. */
  dot: string;
  /** Title on hover, and the node's halo. */
  text: string;
  /** Written out in full because `group-hover:${...}` never reaches Tailwind. */
  hoverText: string;
  glow: string;
}

// Authored literals, never interpolated: Tailwind's scanner only sees classes
// that appear in the source verbatim.
const styles: Record<CategoryKey, CategoryStyle> = {
  feature: {
    icon: Sparkles,
    chip: 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green',
    dot: 'bg-dynamic-green',
    text: 'text-dynamic-green',
    hoverText: 'group-hover:text-dynamic-green',
    glow: 'bg-dynamic-green/20',
  },
  improvement: {
    icon: TrendingUp,
    chip: 'border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue',
    dot: 'bg-dynamic-blue',
    text: 'text-dynamic-blue',
    hoverText: 'group-hover:text-dynamic-blue',
    glow: 'bg-dynamic-blue/20',
  },
  bugfix: {
    icon: Bug,
    chip: 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
    dot: 'bg-dynamic-orange',
    text: 'text-dynamic-orange',
    hoverText: 'group-hover:text-dynamic-orange',
    glow: 'bg-dynamic-orange/20',
  },
  breaking: {
    icon: AlertTriangle,
    chip: 'border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red',
    dot: 'bg-dynamic-red',
    text: 'text-dynamic-red',
    hoverText: 'group-hover:text-dynamic-red',
    glow: 'bg-dynamic-red/20',
  },
  security: {
    icon: Shield,
    chip: 'border-dynamic-purple/25 bg-dynamic-purple/10 text-dynamic-purple',
    dot: 'bg-dynamic-purple',
    text: 'text-dynamic-purple',
    hoverText: 'group-hover:text-dynamic-purple',
    glow: 'bg-dynamic-purple/20',
  },
  performance: {
    icon: Zap,
    chip: 'border-dynamic-cyan/25 bg-dynamic-cyan/10 text-dynamic-cyan',
    dot: 'bg-dynamic-cyan',
    text: 'text-dynamic-cyan',
    hoverText: 'group-hover:text-dynamic-cyan',
    glow: 'bg-dynamic-cyan/20',
  },
};

const fallbackStyle: CategoryStyle = {
  icon: Sparkles,
  chip: 'border-foreground/12 bg-foreground/[0.04] text-foreground/60',
  dot: 'bg-foreground/40',
  text: 'text-foreground',
  hoverText: 'group-hover:text-foreground',
  glow: 'bg-foreground/10',
};

/** Never throws on a category the database grew after this table was written. */
export function styleFor(category: string): CategoryStyle {
  return styles[category as CategoryKey] ?? fallbackStyle;
}

/** Translated labels, keyed by category; unknown values fall back to the raw value. */
export type CategoryLabels = Partial<Record<CategoryKey, string>>;

export function labelFor(category: string, labels: CategoryLabels): string {
  return labels[category as CategoryKey] ?? category;
}

export function formatDate(value: string | null, locale: string): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatShortDate(value: string | null, locale: string): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  });
}

export interface MonthGroup {
  /** e.g. "March 2026" — the heading. */
  label: string;
  entries: ChangelogEntry[];
}

/**
 * Groups by month, newest first, preserving the order the query returned.
 *
 * The old version reduced into an object and then read the keys back, which
 * only kept insertion order by accident of how V8 orders string keys. This
 * walks the sorted list once and never reorders it.
 */
export function groupByMonth(
  entries: ChangelogEntry[],
  locale: string
): MonthGroup[] {
  const groups: MonthGroup[] = [];

  for (const entry of entries) {
    if (!entry.published_at) continue;

    const label = new Date(entry.published_at).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
    });
    const current = groups.at(-1);

    if (current?.label === label) {
      current.entries.push(entry);
    } else {
      groups.push({ label, entries: [entry] });
    }
  }

  return groups;
}
