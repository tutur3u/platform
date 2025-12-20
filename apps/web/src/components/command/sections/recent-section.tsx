'use client';

import { CheckCircle2, Clock, FileText, Search, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { RecentItem } from '../utils/recent-items';
import { clearAllRecent, getRecentItems } from '../utils/recent-items';

dayjs.extend(relativeTime);

interface RecentSectionProps {
  wsId: string | null;
  query: string;
  onSelect?: () => void;
  onApplySearch?: (query: string) => void;
}

export function RecentSection({
  wsId,
  query,
  onSelect,
  onApplySearch,
}: RecentSectionProps) {
  const router = useRouter();
  const [recentItems, setRecentItems] = React.useState<RecentItem[]>([]);

  // Load recent items
  React.useEffect(() => {
    const items = getRecentItems(5);
    setRecentItems(items);
  }, []);

  // Don't show recent if there's a search query
  if (query.trim()) {
    return null;
  }

  if (recentItems.length === 0) {
    return null;
  }

  const handleItemSelect = (item: RecentItem) => {
    if (item.type === 'page') {
      router.push(item.href);
    } else if (item.type === 'task' && wsId) {
      router.push(`/${wsId}/tasks/${item.taskId}`);
    }
    // Search items don't navigate, they just populate the search field
    // This is handled by the parent component

    onSelect?.();
  };

  const handleClearRecent = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAllRecent();
    setRecentItems([]);
  };

  return (
    <>
      <CommandGroup
        heading={
          <div className="flex items-center justify-between">
            <span>Recent</span>
            {recentItems.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearRecent}
                className="h-5 gap-1 px-2 text-muted-foreground text-xs hover:text-foreground"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        }
      >
        {recentItems.map((item, index) => {
          const timestamp = dayjs(item.timestamp).fromNow();

          if (item.type === 'page') {
            return (
              <CommandItem
                key={`recent-page-${index}`}
                value={`recent-page-${item.href}`}
                onSelect={() => handleItemSelect(item)}
                className="flex items-center gap-3"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.title}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {timestamp}
                  </span>
                </div>
                <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
              </CommandItem>
            );
          }

          if (item.type === 'task') {
            return (
              <CommandItem
                key={`recent-task-${index}`}
                value={`recent-task-${item.taskId}`}
                onSelect={() => handleItemSelect(item)}
                className="flex items-center gap-3"
              >
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.taskName}</span>
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    {item.boardName && <span>{item.boardName}</span>}
                    {item.boardName && <span>•</span>}
                    <span>{timestamp}</span>
                  </div>
                </div>
                <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
              </CommandItem>
            );
          }

          if (item.type === 'search') {
            return (
              <CommandItem
                key={`recent-search-${index}`}
                value={`recent-search-${item.query}`}
                onSelect={() => {
                  // Populate the search field instead of closing
                  if (onApplySearch) {
                    onApplySearch(item.query);
                  }
                }}
                className="flex items-center gap-3"
              >
                <Search className="h-4 w-4 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.query}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {timestamp}
                  </span>
                </div>
                <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
              </CommandItem>
            );
          }

          return null;
        })}
      </CommandGroup>
      <CommandSeparator />
    </>
  );
}
