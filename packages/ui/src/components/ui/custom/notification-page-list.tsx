'use client';

import { CircleAlert, Loader2, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { NotificationFilter } from '@tuturuuu/ui/hooks/use-notifications';
import { cn } from '@tuturuuu/utils/format';
import { type KeyboardEvent, useCallback, useId, useMemo } from 'react';
import { NotificationCard } from './notification-card';
import { useNotificationRowActions } from './notification-card-actions';
import type { NotificationCodeText } from './notification-code-text';
import type { NotificationStack } from './notification-grouping';
import type { ListQuery } from './notification-list';
import {
  fillTemplate,
  type NotificationPageLabels,
} from './notification-page-labels';
import { useNotificationRoving } from './notification-roving';
import { notificationTargetAppName } from './notification-targets';

export interface NotificationPageSection {
  key: string;
  label: string;
  stacks: NotificationStack[];
}

const ROW = '[data-notification-row]';

/** Sections of selectable notification rows with page keyboard shortcuts. */
export function NotificationPageList({
  query,
  sections,
  filter,
  labels,
  codeText,
  routeWsId,
  selected,
  onSelect,
  onToggle,
  onMarkSection,
}: {
  query: ListQuery;
  sections: NotificationPageSection[];
  filter: NotificationFilter;
  labels: NotificationPageLabels;
  codeText?: NotificationCodeText;
  routeWsId?: string;
  selected: ReadonlySet<string>;
  onSelect: (stack: NotificationStack, range: boolean) => void;
  onToggle: (stack: NotificationStack, read: boolean) => void | Promise<void>;
  onMarkSection: (stacks: NotificationStack[]) => void;
}) {
  const idPrefix = useId();
  const stacks = useMemo(() => sections.flatMap((s) => s.stacks), [sections]);
  const rowIds = useMemo(() => stacks.map((s) => s.lead.id), [stacks]);
  const byId = useMemo(
    () => new Map(stacks.map((s) => [s.lead.id, s])),
    [stacks]
  );
  const noop = useCallback(() => {}, []);
  const { target, opening, openStack, resolveInvite } =
    useNotificationRowActions({ routeWsId, onToggle, onNavigate: noop });

  const toggle = useCallback(
    (stack: NotificationStack) => onToggle(stack, stack.unread),
    [onToggle]
  );
  const roving = useNotificationRoving({
    rowIds,
    onToggle: (id) => {
      const stack = byId.get(id);
      if (!stack) return;
      // In Unread, a read row leaves the list; keep keyboard focus in place.
      if (filter === 'unread' && stack.unread) roving.focusNeighbor(id);
      void toggle(stack);
    },
    onOpen: (id) => {
      const stack = byId.get(id);
      if (stack) void openStack(stack);
    },
  });

  // Page-only keys on a focused row; everything else goes to roving focus.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(ROW);
    if (row && row === event.target && !event.metaKey && !event.ctrlKey) {
      const id = row.dataset.notificationRow ?? '';
      const index = rowIds.indexOf(id);
      const stack = byId.get(id);
      switch (event.key) {
        case 'j':
          roving.focusRow(rowIds[Math.min(rowIds.length - 1, index + 1)]);
          event.preventDefault();
          return;
        case 'k':
          roving.focusRow(rowIds[Math.max(0, index - 1)]);
          event.preventDefault();
          return;
        case 'x':
        case 'X':
        case ' ':
          if (stack) onSelect(stack, event.shiftKey);
          event.preventDefault();
          return;
      }
    }
    roving.onKeyDown(event);
  };

  // Loads the next page when the end of the list scrolls into view.
  const sentinel = useCallback(
    (node: HTMLDivElement | null) => {
      // After a failed page only Retry resumes, so a visible sentinel cannot
      // retry in a loop.
      if (!node || !query.hasNextPage || query.isFetchNextPageError) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting && !query.isFetchingNextPage)
            void query.fetchNextPage();
        },
        { rootMargin: '240px' }
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [
      query.hasNextPage,
      query.isFetchingNextPage,
      query.isFetchNextPageError,
      query.fetchNextPage,
    ]
  );

  const selecting = selected.size > 0;

  return (
    <div
      ref={(node) => {
        roving.containerRef.current = node;
      }}
      onKeyDown={onKeyDown}
    >
      {query.isRefetchError && (
        <div
          role="status"
          className="mt-3 flex items-center gap-2 rounded-lg border border-dynamic-red/40 px-2.5 py-1.5 text-xs"
        >
          <CircleAlert aria-hidden className="size-3.5 text-dynamic-red" />
          <span className="flex-1">{labels.refreshError}</span>
          <Button size="sm" variant="ghost" onClick={() => query.refetch()}>
            {labels.retry}
          </Button>
        </div>
      )}
      {sections.map((section) => {
        const headingId = `${idPrefix}-${section.key}`;
        const hasUnread = section.stacks.some((s) => s.unread);
        return (
          <section key={section.key} aria-labelledby={headingId}>
            <div className="mt-4 flex h-8 items-center gap-2 px-2.5">
              <h2
                id={headingId}
                className="font-semibold text-muted-foreground text-xs"
              >
                {section.label}
              </h2>
              <span className="text-muted-foreground text-xs tabular-nums">
                {section.stacks.length}
              </span>
              <span aria-hidden className="h-px flex-1 bg-border" />
              {section.key !== 'needsAction' && (
                <Button
                  size="sm"
                  variant="ghost"
                  // Kept in layout when nothing is unread so headers align.
                  className={cn(
                    'h-7 px-2 text-muted-foreground text-xs',
                    !hasUnread && 'invisible'
                  )}
                  tabIndex={hasUnread ? undefined : -1}
                  aria-hidden={hasUnread ? undefined : true}
                  aria-label={fillTemplate(labels.markSectionRead, {
                    section: section.label,
                  })}
                  onClick={() => onMarkSection(section.stacks)}
                >
                  {labels.markAllRead}
                </Button>
              )}
            </div>
            <ul className="space-y-px">
              {section.stacks.map((stack) => (
                <NotificationCard
                  key={stack.lead.id}
                  stack={stack}
                  labels={labels}
                  codeText={codeText}
                  tabbable={roving.activeId === stack.lead.id}
                  openApp={notificationTargetAppName(target(stack.lead))}
                  opening={opening === stack.lead.id}
                  onFocusRow={roving.setActiveId}
                  onToggle={toggle}
                  onOpen={openStack}
                  onInviteResolved={resolveInvite}
                  selection={{
                    selected: selected.has(stack.lead.id),
                    visible: selecting,
                    label: labels.selectRow,
                    onSelect,
                  }}
                />
              ))}
            </ul>
          </section>
        );
      })}
      <div ref={sentinel} className="h-px" />
      <div className="flex min-h-11 items-center justify-center gap-2 text-muted-foreground text-xs">
        {query.isFetchingNextPage ? (
          <span role="status" className="inline-flex items-center gap-2">
            <Loader2 aria-hidden className="size-3 animate-spin" />
            {labels.loadingMore}
          </span>
        ) : query.isFetchNextPageError ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => query.fetchNextPage()}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            {labels.retry}
          </Button>
        ) : (
          !query.hasNextPage && filter === 'all' && labels.noOlder
        )}
      </div>
    </div>
  );
}
