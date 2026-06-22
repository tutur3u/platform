import {
  AlertTriangle,
  Bug,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from '@tuturuuu/icons';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import type { ReactNode } from 'react';
import type { ChangelogEntry } from './types';

export type ChangelogCategoryConfig = {
  colorClass: string;
  icon: ReactNode;
  label: string;
};

const categoryConfig: Record<string, ChangelogCategoryConfig> = {
  feature: {
    colorClass:
      'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
    icon: <Sparkles className="h-4 w-4" />,
    label: 'New Feature',
  },
  improvement: {
    colorClass: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
    icon: <TrendingUp className="h-4 w-4" />,
    label: 'Improvement',
  },
  bugfix: {
    colorClass:
      'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
    icon: <Bug className="h-4 w-4" />,
    label: 'Bug Fix',
  },
  breaking: {
    colorClass: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
    icon: <AlertTriangle className="h-4 w-4" />,
    label: 'Breaking Change',
  },
  security: {
    colorClass:
      'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20',
    icon: <Shield className="h-4 w-4" />,
    label: 'Security',
  },
  performance: {
    colorClass: 'bg-dynamic-cyan/10 text-dynamic-cyan border-dynamic-cyan/20',
    icon: <Zap className="h-4 w-4" />,
    label: 'Performance',
  },
};

export const defaultContent: JSONContent = {
  content: [{ content: [], type: 'paragraph' }],
  type: 'doc',
};

export function getChangelogCategoryConfig(category: string) {
  return (
    categoryConfig[category] ?? {
      colorClass: 'bg-muted text-muted-foreground',
      icon: null,
      label: category,
    }
  );
}

export function getChangelogCategoryLabel(category: string) {
  return getChangelogCategoryConfig(category).label;
}

export function formatChangelogDate(dateString: string | null): string {
  if (!dateString) {
    return '';
  }

  return new Date(dateString).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function groupChangelogsByMonth(entries: ChangelogEntry[]) {
  return entries.reduce<Record<string, ChangelogEntry[]>>((groups, entry) => {
    if (!entry.published_at) {
      return groups;
    }

    const monthYear = new Date(entry.published_at).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    groups[monthYear] ??= [];
    groups[monthYear].push(entry);
    return groups;
  }, {});
}

export function getAdjacentChangelogs(
  entries: ChangelogEntry[],
  currentSlug: string
) {
  const currentIndex = entries.findIndex((entry) => entry.slug === currentSlug);

  return {
    next:
      currentIndex > 0
        ? pickAdjacentEntry(entries[currentIndex - 1] ?? null)
        : null,
    previous:
      currentIndex >= 0
        ? pickAdjacentEntry(entries[currentIndex + 1] ?? null)
        : null,
  };
}

function pickAdjacentEntry(entry: ChangelogEntry | null) {
  return entry ? { slug: entry.slug, title: entry.title } : null;
}
