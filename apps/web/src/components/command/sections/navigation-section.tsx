'use client';

import { ChevronRight } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { addRecentPage, getRecencyBoost } from '../utils/recent-items';
import { searchItems } from '../utils/search-scoring';
import type { FlatNavItem } from '../utils/use-navigation-data';

interface NavigationSectionProps {
  navItems: FlatNavItem[];
  query: string;
  onSelect?: () => void;
}

interface GroupedResults {
  [category: string]: Array<{ item: FlatNavItem; score: number }>;
}

export function NavigationSection({
  navItems,
  query,
  onSelect,
}: NavigationSectionProps) {
  const router = useRouter();

  // Search through navigation items with recency boost
  const results = React.useMemo(() => {
    return searchItems(navItems, query, {
      limit: 20,
      minScore: query.trim() ? 100 : 0,
      getBoost: (item) => getRecencyBoost(item.href),
    });
  }, [navItems, query]);

  // Group results by category
  const groupedResults = React.useMemo(() => {
    if (!query.trim()) {
      // When no query, just show top results ungrouped
      return { '': results };
    }

    const grouped: GroupedResults = {};

    for (const result of results) {
      const category = result.item.path[0] || 'Other';

      if (!grouped[category]) {
        grouped[category] = [];
      }

      grouped[category].push(result);
    }

    return grouped;
  }, [results, query]);

  if (results.length === 0) {
    return null;
  }

  const handleNavigate = (item: FlatNavItem) => {
    // Track in recent items
    addRecentPage(item.href, item.title);

    // Navigate
    router.push(item.href);

    // Close command palette
    onSelect?.();
  };

  const renderNavigationItem = (item: FlatNavItem, _score: number) => {
    // Build breadcrumb path
    const breadcrumb = item.path.join(' › ');

    return (
      <CommandItem
        key={item.href}
        value={`nav-${item.href}`}
        onSelect={() => handleNavigate(item)}
        className="flex items-center gap-3"
      >
        {/* Icon */}
        {item.icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
            {item.icon}
          </div>
        )}

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{item.title}</span>
            {item.experimental && (
              <Badge
                variant="outline"
                className="shrink-0 text-[10px] uppercase"
              >
                {item.experimental}
              </Badge>
            )}
          </div>
          {breadcrumb && (
            <span className="truncate text-muted-foreground text-xs">
              {breadcrumb}
            </span>
          )}
        </div>

        {/* Indicator */}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </CommandItem>
    );
  };

  // Render grouped or ungrouped based on query
  const hasQuery = query.trim().length > 0;
  const categories = Object.keys(groupedResults).sort();

  return (
    <>
      {categories.map((category) => {
        const categoryResults = groupedResults[category];
        if (!categoryResults || categoryResults.length === 0) return null;

        // For ungrouped results (empty category key), use simple "Navigation" heading
        const heading =
          hasQuery && category
            ? `${category} (${categoryResults.length})`
            : 'Navigation';

        return (
          <CommandGroup key={category || 'navigation'} heading={heading}>
            {categoryResults.map(({ item, score }) =>
              renderNavigationItem(item, score)
            )}
          </CommandGroup>
        );
      })}
    </>
  );
}
