'use client';

import { ChevronRight, Search, X } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { PastResultsBody } from './past-results';
import { filterPastMeetings } from './section-rules';
import type { MeetingManagement, PastController } from './types';

/**
 * Past meetings behind a disclosure. Rows mount only while expanded, so a
 * collapsed section starts no per-meeting room-state reads.
 */
export function PastSection({
  choice,
  onChoiceChange,
  count,
  results,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  onLoadOlder,
  onRetry,
  accountId,
  wsId,
  timeZone,
  management,
}: PastController & {
  accountId: string;
  wsId: string;
  timeZone: string | undefined;
  management: MeetingManagement;
}) {
  const t = useTranslations('meet.meetings');
  const commonT = useTranslations('common');
  const panelId = useId();
  const expanded = choice === 'expanded';
  const meetings =
    results.kind === 'ready'
      ? filterPastMeetings(results.meetings, filter, accountId)
      : [];
  return (
    <section aria-labelledby={`${panelId}-heading`} className="space-y-3">
      <h2 className="font-semibold text-base tracking-tight">
        <button
          aria-controls={panelId}
          aria-expanded={expanded}
          className="-mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id={`${panelId}-heading`}
          onClick={() => onChoiceChange(expanded ? 'collapsed' : 'expanded')}
          type="button"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              'size-4 text-muted-foreground transition-transform motion-reduce:transition-none',
              expanded && 'rotate-90'
            )}
          />
          {t('section_past')}
          <span className="font-normal text-muted-foreground text-sm tabular-nums">
            {count.loaded}
            {count.more ? '+' : ''}
          </span>
        </button>
      </h2>
      {expanded && (
        <div className="space-y-3" id={panelId}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search
                aria-hidden
                className="absolute top-2.5 left-3 size-4 text-muted-foreground"
              />
              <Input
                aria-label={t('search_past')}
                className="pr-9 pl-9"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={t('search_past')}
                type="search"
                value={search}
              />
              {search && (
                <button
                  aria-label={t('clear_search')}
                  className="absolute top-1.5 right-1.5 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSearchChange('')}
                  type="button"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <ToggleGroup
              aria-label={t('filter_label')}
              onValueChange={(value) => {
                if (value === 'all' || value === 'mine') onFilterChange(value);
              }}
              type="single"
              value={filter}
              variant="outline"
            >
              <ToggleGroupItem className="px-3" value="all">
                {t('filter_all')}
              </ToggleGroupItem>
              <ToggleGroupItem className="px-3" value="mine">
                {t('filter_mine')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            <PastResultsBody
              accountId={accountId}
              clearLabel={t('clear_search')}
              management={management}
              meetings={meetings}
              onClear={() => {
                onSearchChange('');
                onFilterChange('all');
              }}
              onLoadOlder={onLoadOlder}
              onRetry={onRetry}
              results={results}
              retryLabel={commonT('refresh')}
              timeZone={timeZone}
              wsId={wsId}
              narrowed={Boolean(search) || filter !== 'all'}
            />
          </div>
        </div>
      )}
    </section>
  );
}
