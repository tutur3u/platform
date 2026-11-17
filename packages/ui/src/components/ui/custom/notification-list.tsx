'use client';

import { CircleAlert, Loader2, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type {
  NotificationFilter,
  useInfiniteNotifications,
} from '@tuturuuu/ui/hooks/use-notifications';
import { useCallback, useId, useMemo } from 'react';
import { NotificationCard } from './notification-card';
import { useNotificationRowActions } from './notification-card-actions';
import { notificationTargetAppName } from './notification-targets';
import type { NotificationCodeText } from './notification-code-text';
import {
  groupNotifications,
  type NotificationStack,
} from './notification-grouping';
import type { NotificationLabels } from './notification-labels';
import { NotificationListState } from './notification-list-state';
import { useNotificationRoving } from './notification-roving';

export type ListQuery = ReturnType<typeof useInfiniteNotifications>;

export function NotificationList({
  query,
  filter,
  labels,
  codeText,
  routeWsId,
  onToggle,
  onShowAll,
  onNavigate,
  autoFocusFirst = true,
}: {
  query: ListQuery;
  filter: NotificationFilter;
  labels: NotificationLabels;
  codeText?: NotificationCodeText;
  routeWsId?: string;
  onToggle: (stack: NotificationStack, read: boolean) => void | Promise<void>;
  onShowAll: () => void;
  onNavigate: () => void;
  /** Focus the first row when rows first appear while the dialog holds focus. */
  autoFocusFirst?: boolean;
}) {
  const sections = useMemo(
    () =>
      groupNotifications(
        query.data?.pages.flatMap((page) => page.notifications) ?? []
      ),
    [query.data]
  );
  const stacks = useMemo(
    () => sections.flatMap((section) => section.stacks),
    [sections]
  );
  const rowIds = useMemo(() => stacks.map((s) => s.lead.id), [stacks]);
  const byId = useMemo(
    () => new Map(stacks.map((s) => [s.lead.id, s])),
    [stacks]
  );
  const { target, opening, openStack, resolveInvite } =
    useNotificationRowActions({ routeWsId, onToggle, onNavigate });
  const idPrefix = useId();

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
      toggle(stack);
    },
    onOpen: (id) => {
      const stack = byId.get(id);
      if (stack) void openStack(stack);
    },
  });

  const attachRows = useCallback(
    (node: HTMLDivElement | null) => {
      roving.containerRef.current = node;
      if (!node || !autoFocusFirst) return;
      const dialog = node.closest('[role="dialog"]');
      if (dialog && document.activeElement === dialog)
        node.querySelector<HTMLElement>('[data-notification-row]')?.focus();
    },
    [autoFocusFirst]
  );

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
        {
          root: node.closest('[data-notification-scroll]'),
          rootMargin: '120px',
        }
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

  if (!query.data || stacks.length === 0) {
    return (
      <NotificationListState
        query={query}
        filter={filter}
        labels={labels}
        onShowAll={onShowAll}
      />
    );
  }

  return (
    <div ref={attachRows} onKeyDown={roving.onKeyDown}>
      {query.isRefetchError && (
        <div
          role="status"
          className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-dynamic-red/40 px-2.5 py-1.5 text-xs"
        >
          <CircleAlert aria-hidden className="size-3.5 text-dynamic-red" />
          <span className="flex-1">{labels.refreshError}</span>
          <Button size="sm" variant="ghost" onClick={() => query.refetch()}>
            {labels.retry}
          </Button>
        </div>
      )}
      {sections.map((section) => (
        <section
          key={section.key}
          aria-labelledby={`${idPrefix}-${section.key}`}
        >
          <h3
            id={`${idPrefix}-${section.key}`}
            className="sticky top-0 z-1 bg-popover px-4 pt-2.5 pb-1 font-semibold text-muted-foreground text-xs"
          >
            {labels[section.key]}
          </h3>
          <ul className="px-1.5">
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
              />
            ))}
          </ul>
        </section>
      ))}
      <div ref={sentinel} className="h-px" />
      <div className="flex items-center justify-center gap-2 p-2.5 text-muted-foreground text-xs">
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
