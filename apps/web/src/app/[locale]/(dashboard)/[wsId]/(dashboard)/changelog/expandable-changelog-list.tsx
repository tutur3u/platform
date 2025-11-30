'use client';

import {
  AlertTriangle,
  Bug,
  ChevronDown,
  ChevronUp,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

interface ChangelogEntry {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  category: string;
  version: string | null;
  published_at: string | null;
}

interface ExpandableChangelogListProps {
  entries: ChangelogEntry[];
  initialLimit?: number;
}

const DEFAULT_CATEGORY_CONFIG = {
  icon: Sparkles,
  color: 'dynamic-blue',
  label: 'Update',
} as const;

const CATEGORY_CONFIG: Record<
  string,
  { icon: typeof Sparkles; color: string; label: string }
> = {
  feature: {
    icon: Sparkles,
    color: 'dynamic-green',
    label: 'Feature',
  },
  improvement: {
    icon: TrendingUp,
    color: 'dynamic-blue',
    label: 'Improvement',
  },
  bugfix: {
    icon: Bug,
    color: 'dynamic-orange',
    label: 'Bug Fix',
  },
  breaking: {
    icon: AlertTriangle,
    color: 'dynamic-red',
    label: 'Breaking',
  },
  security: {
    icon: Shield,
    color: 'dynamic-purple',
    label: 'Security',
  },
  performance: {
    icon: Zap,
    color: 'dynamic-yellow',
    label: 'Performance',
  },
};

function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] ?? DEFAULT_CATEGORY_CONFIG;
}

export default function ExpandableChangelogList({
  entries,
  initialLimit = 3,
}: ExpandableChangelogListProps) {
  const [showAll, setShowAll] = useState(false);
  const t = useTranslations('dashboard');

  const displayedEntries = showAll ? entries : entries.slice(0, initialLimit);
  const hasMoreEntries = entries.length > initialLimit;

  return (
    <div className="space-y-3">
      {displayedEntries.map((entry, index) => {
        const isFirst = index === 0;
        const config = getCategoryConfig(entry.category);
        const CategoryIcon = config.icon;

        return (
          <Link
            href={`/changelog/${entry.slug}`}
            key={entry.id}
            className="group/entry block"
          >
            <div
              className={cn(
                'relative overflow-hidden rounded-xl border p-4 transition-all duration-200 hover:shadow-md',
                isFirst
                  ? 'border-dynamic-blue/40 bg-linear-to-br from-dynamic-blue/10 via-dynamic-blue/5 to-transparent'
                  : 'border-border/50 hover:border-dynamic-blue/30 hover:bg-dynamic-blue/5'
              )}
            >
              {/* Left accent for first entry */}
              {isFirst && (
                <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-dynamic-blue" />
              )}

              <div className={cn(isFirst && 'pl-2')}>
                {/* Header row: Category badge + Version */}
                <div className="mb-2 flex items-center gap-2">
                  <Badge
                    className={cn(
                      'gap-1 px-2 py-0.5 font-medium text-[10px]',
                      isFirst
                        ? `bg-${config.color}/15 text-${config.color} ring-1 ring-${config.color}/30`
                        : 'bg-muted text-muted-foreground'
                    )}
                    style={{
                      backgroundColor: isFirst
                        ? `rgb(var(--${config.color}) / 0.15)`
                        : undefined,
                      color: isFirst
                        ? `rgb(var(--${config.color}))`
                        : undefined,
                      boxShadow: isFirst
                        ? `0 0 0 1px rgb(var(--${config.color}) / 0.3)`
                        : undefined,
                    }}
                  >
                    <CategoryIcon className="h-3 w-3" />
                    {config.label}
                  </Badge>
                  {entry.version && (
                    <span className="text-muted-foreground text-xs">
                      v{entry.version}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h4 className="line-clamp-1 font-semibold text-sm transition-colors group-hover/entry:text-dynamic-blue">
                  {entry.title}
                </h4>

                {/* Summary */}
                {entry.summary && (
                  <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                    {entry.summary}
                  </p>
                )}

                {/* Date */}
                <div className="mt-2 text-muted-foreground/70 text-xs">
                  {entry.published_at &&
                    formatDistanceToNow(new Date(entry.published_at), {
                      addSuffix: true,
                    })}
                </div>
              </div>
            </div>
          </Link>
        );
      })}

      {/* Expand/Collapse button */}
      {hasMoreEntries && (
        <div className="flex justify-center pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="gap-2 text-muted-foreground hover:text-dynamic-blue"
          >
            {showAll ? (
              <>
                <ChevronUp className="h-4 w-4" />
                {t('show_less')}
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                {t('show_more_updates')}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
