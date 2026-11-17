'use client';

import { Settings } from '@tuturuuu/icons';
import {
  type NotificationFilter,
  useInfiniteNotifications,
  useMarkAllAsRead,
  useNotificationSubscription,
  useUnreadCount,
  useUpdateNotification,
} from '@tuturuuu/ui/hooks/use-notifications';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NotificationCodeText } from './notification-code-text';
import {
  groupNotifications,
  groupNotificationsByApp,
  type NotificationStack,
} from './notification-grouping';
import { fillCount } from './notification-labels';
import {
  NotificationPageList,
  type NotificationPageSection,
} from './notification-page-list';
import type { NotificationPageLabels } from './notification-page-labels';
import {
  NotificationShortcutHints,
  NotificationShortcutsDialog,
} from './notification-page-shortcuts';
import {
  NotificationPageEmpty,
  NotificationPageError,
  NotificationPageSkeleton,
} from './notification-page-state';
import {
  type NotificationGroupBy,
  NotificationPageToolbar,
} from './notification-page-toolbar';
import { useNotificationRuntime } from './notification-runtime';

export const NOTIFICATION_PAGE_SIZE = 30;

export interface NotificationPageProps {
  userId: string;
  /** Workspace UUID from the route, when there is one. */
  routeWsId?: string;
  /** Route workspace identifier (UUID or personal/internal) for task links. */
  taskWsId?: string;
  labels: NotificationPageLabels;
  codeText?: NotificationCodeText;
  settingsHref?: string;
}

type ListView =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'ready'; sections: NotificationPageSection[] };

/** Members a read-state change touches, by the same rule as the popover. */
const changedIds = (stack: NotificationStack, read: boolean) =>
  read
    ? [stack.lead, ...stack.rest].filter((n) => !n.read_at).map((n) => n.id)
    : stack.lead.read_at
      ? [stack.lead.id]
      : [];

export function NotificationPage({
  userId,
  routeWsId,
  taskWsId,
  labels,
  codeText,
  settingsHref,
}: NotificationPageProps) {
  const { Link, realtime, apiOptions } = useNotificationRuntime();
  const [filter, setFilter] = useState<NotificationFilter>('unread');
  const [groupBy, setGroupBy] = useState<NotificationGroupBy>('time');
  const [scopeAll, setScopeAll] = useState(true);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const anchor = useRef<string | null>(null);
  // Stays mounted while the toolbar swaps, so focus can land here when the
  // focused selection control unmounts.
  const selectAllRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const wsId = routeWsId && !scopeAll ? routeWsId : undefined;
  const actor = { cacheScope: userId, apiOptions };
  const query = useInfiniteNotifications({
    cacheScope: userId,
    wsId,
    unreadOnly: filter === 'unread',
    pageSize: NOTIFICATION_PAGE_SIZE,
    apiOptions,
  });
  const { data: unreadCount = 0 } = useUnreadCount(wsId, {
    cacheScope: userId,
    apiOptions,
  });
  useNotificationSubscription(routeWsId ?? '', realtime ? userId : '');
  const update = useUpdateNotification(actor);
  const markAll = useMarkAllAsRead(actor);

  const view = useMemo<ListView>(() => {
    if (!query.data)
      return query.isError ? { kind: 'error' } : { kind: 'loading' };
    const rows = query.data.pages.flatMap((page) => page.notifications);
    if (rows.length === 0) return { kind: 'empty' };
    const sections =
      groupBy === 'app'
        ? groupNotificationsByApp(rows)
        : groupNotifications(rows);
    return {
      kind: 'ready',
      sections: sections.map((s) => ({ ...s, label: labels[s.key] })),
    };
  }, [query.data, query.isError, groupBy, labels]);

  const stacks = useMemo(
    () => (view.kind === 'ready' ? view.sections.flatMap((s) => s.stacks) : []),
    [view]
  );
  // Selection only ever covers rows on screen.
  const visibleSelected = useMemo(() => {
    const ids = new Set(stacks.map((s) => s.lead.id));
    return new Set([...selected].filter((id) => ids.has(id)));
  }, [selected, stacks]);

  const clearSelection = useCallback(() => {
    anchor.current = null;
    setSelected(new Set());
  }, []);
  const clearSelectionAndRefocus = useCallback(() => {
    clearSelection();
    // After render: an emptied list disables select-all, so the heading
    // takes focus instead of the page body.
    requestAnimationFrame(() => {
      const selectAll = selectAllRef.current;
      if (selectAll && !selectAll.disabled) selectAll.focus();
      else headingRef.current?.focus();
    });
  }, [clearSelection]);

  const onSelect = useCallback(
    (stack: NotificationStack, range: boolean) => {
      const id = stack.lead.id;
      setSelected((current) => {
        const next = new Set(current);
        const order = stacks.map((s) => s.lead.id);
        const from = anchor.current ? order.indexOf(anchor.current) : -1;
        if (range && from >= 0) {
          const to = order.indexOf(id);
          const [a, b] = from < to ? [from, to] : [to, from];
          for (const rowId of order.slice(a, b + 1)) next.add(rowId);
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchor.current = id;
    },
    [stacks]
  );

  const setRead = useCallback(
    async (targets: NotificationStack[], read: boolean) => {
      const ids = targets.flatMap((stack) => changedIds(stack, read));
      if (ids.length === 0) return true;
      const results = await Promise.allSettled(
        ids.map((id) => update.mutateAsync({ id, read }))
      );
      if (results.some((r) => r.status === 'rejected')) {
        toast.error(labels.updateError);
        return false;
      }
      return true;
    },
    [update.mutateAsync, labels.updateError]
  );

  const onToggle = useCallback(
    async (stack: NotificationStack, read: boolean) => {
      if (await setRead([stack], read))
        setAnnouncement(read ? labels.markedAsRead : labels.markedAsUnread);
    },
    [setRead, labels]
  );

  const onBulkRead = async (read: boolean) => {
    const targets = stacks.filter((s) => visibleSelected.has(s.lead.id));
    setBulkPending(true);
    try {
      if (await setRead(targets, read)) {
        const template = read
          ? labels.markedSelectionRead
          : labels.markedSelectionUnread;
        setAnnouncement(fillCount(template, targets.length));
        clearSelectionAndRefocus();
      }
    } finally {
      setBulkPending(false);
    }
  };

  const onMarkSection = useCallback(
    async (sectionStacks: NotificationStack[]) => {
      if (await setRead(sectionStacks, true))
        setAnnouncement(labels.markedAsRead);
    },
    [setRead, labels.markedAsRead]
  );

  const onMarkAll = async () => {
    try {
      await markAll.mutateAsync(wsId);
      toast.success(labels.markedAllRead);
    } catch {
      toast.error(labels.markAllError);
    }
  };

  const changeFilter = (next: NotificationFilter) => {
    clearSelection();
    setFilter(next);
  };

  // Page-wide keys work wherever focus is on the page, including the body
  // after navigation; typing and open overlays keep their own keys.
  const pageKeys = useRef<(event: globalThis.KeyboardEvent) => void>(() => {});
  pageKeys.current = (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (
      shortcutsOpen ||
      target?.closest(
        'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"], [role="menu"]'
      )
    )
      return;
    if (event.key === '?') {
      setShortcutsOpen(true);
      event.preventDefault();
    } else if (event.key === 'Escape' && visibleSelected.size > 0) {
      // From a row the keyboard user keeps their place in the list.
      if (target?.closest('[data-notification-row]')) clearSelection();
      else clearSelectionAndRefocus();
      event.preventDefault();
    }
  };
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) =>
      pageKeys.current(event);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-4 pb-28 md:px-6 md:pb-10">
      <header className="mb-3 flex h-10 items-center gap-2">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-semibold text-lg outline-none"
        >
          {labels.notifications}
        </h1>
        <span className="flex-1" />
        {settingsHref && (
          <Link
            href={settingsHref}
            aria-label={labels.settings}
            title={labels.settings}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings aria-hidden className="size-4" />
          </Link>
        )}
      </header>

      <NotificationPageToolbar
        labels={labels}
        ready={view.kind === 'ready' || view.kind === 'empty'}
        filter={filter}
        onFilter={changeFilter}
        unreadCount={unreadCount}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        scopeAll={routeWsId ? scopeAll : undefined}
        onToggleScope={() => {
          clearSelection();
          setScopeAll((value) => !value);
        }}
        markAllPending={markAll.isPending}
        onMarkAll={onMarkAll}
        selectedCount={visibleSelected.size}
        selectableCount={stacks.length}
        onSelectAll={() => setSelected(new Set(stacks.map((s) => s.lead.id)))}
        onClearSelection={clearSelectionAndRefocus}
        selectAllRef={selectAllRef}
        canMarkUnread={filter !== 'unread'}
        bulkPending={bulkPending}
        onBulkRead={onBulkRead}
      />

      {view.kind === 'loading' ? (
        <NotificationPageSkeleton labels={labels} />
      ) : view.kind === 'error' ? (
        <NotificationPageError
          labels={labels}
          retrying={query.isFetching}
          onRetry={() => query.refetch()}
        />
      ) : view.kind === 'empty' ? (
        <NotificationPageEmpty
          labels={labels}
          unreadOnly={filter === 'unread'}
          onShowAll={() => changeFilter('all')}
        />
      ) : (
        <NotificationPageList
          key={`${filter}:${wsId ?? 'all'}:${groupBy}`}
          query={query}
          sections={view.sections}
          filter={filter}
          labels={labels}
          codeText={codeText}
          routeWsId={taskWsId}
          selected={visibleSelected}
          onSelect={onSelect}
          onToggle={onToggle}
          onMarkSection={onMarkSection}
        />
      )}

      <NotificationShortcutHints
        labels={labels}
        onShowAll={() => setShortcutsOpen(true)}
      />
      <NotificationShortcutsDialog
        labels={labels}
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
