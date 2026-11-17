'use client';

import { ChevronRight } from '@tuturuuu/icons';
import {
  type MarkAllReadResult,
  type NotificationFilter,
  useInfiniteNotifications,
  useMarkAllAsRead,
  useUndoMarkAllAsRead,
  useUnreadCount,
  useUpdateNotification,
} from '@tuturuuu/ui/hooks/use-notifications';
import { toast } from '@tuturuuu/ui/sonner';
import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import { useCallback, useState } from 'react';
import type { NotificationCodeText } from './notification-code-text';
import type { NotificationStack } from './notification-grouping';
import type { NotificationLabels } from './notification-labels';
import { NotificationList } from './notification-list';
import { NotificationPanelHeader } from './notification-panel-header';
import { useNotificationRuntime } from './notification-runtime';

export const NOTIFICATION_PAGE_SIZE = 20;

export interface NotificationPanelProps {
  userId: string;
  /** Workspace UUID from the route, when there is one. */
  routeWsId?: string;
  /** Route workspace identifier (UUID or personal/internal) for task links. */
  taskWsId?: string;
  labels: NotificationLabels;
  codeText?: NotificationCodeText;
  pageUrl: string;
  refetchInterval?: number;
  apiOptions?: InternalApiClientOptions;
  titleId: string;
  onClose: () => void;
}

export function NotificationPanel({
  userId,
  routeWsId,
  taskWsId,
  labels,
  codeText,
  pageUrl,
  refetchInterval,
  apiOptions,
  titleId,
  onClose,
}: NotificationPanelProps) {
  const { Link } = useNotificationRuntime();
  const [filter, setFilter] = useState<NotificationFilter>('unread');
  const [scope, setScope] = useState<'workspace' | 'all'>('workspace');
  const [announcement, setAnnouncement] = useState('');
  const wsId = scope === 'workspace' ? routeWsId : undefined;
  const actor = { cacheScope: userId, apiOptions };

  const query = useInfiniteNotifications({
    cacheScope: userId,
    wsId,
    unreadOnly: filter === 'unread',
    pageSize: NOTIFICATION_PAGE_SIZE,
    refetchInterval,
    apiOptions,
  });
  const { data: unreadCount = 0 } = useUnreadCount(wsId, {
    cacheScope: userId,
    refetchInterval,
    apiOptions,
  });
  const update = useUpdateNotification(actor);
  const markAll = useMarkAllAsRead(actor);
  const undo = useUndoMarkAllAsRead(actor);

  const onToggle = useCallback(
    async (stack: NotificationStack, read: boolean) => {
      const members = [stack.lead, ...stack.rest];
      const ids = read
        ? members.filter((n) => !n.read_at).map((n) => n.id)
        : [stack.lead.id];
      const results = await Promise.allSettled(
        ids.map((id) => update.mutateAsync({ id, read }))
      );
      if (results.some((r) => r.status === 'rejected')) {
        toast.error(labels.updateError);
        return;
      }
      setAnnouncement(read ? labels.markedAsRead : labels.markedAsUnread);
    },
    [update.mutateAsync, labels]
  );

  const runUndo = async (result: MarkAllReadResult) => {
    try {
      const { requested, restored } = await undo.mutateAsync(result);
      if (restored.length === requested) toast.success(labels.undoDone);
      else toast(labels.undoPartial);
    } catch {
      toast.error(labels.undoError);
    }
  };

  const onMarkAll = async () => {
    try {
      const result = await markAll.mutateAsync(wsId);
      // The button leaves with the last unread row; keep focus in the dialog.
      document
        .getElementById(titleId)
        ?.closest<HTMLElement>('[role="dialog"]')
        ?.focus();
      toast.success(labels.markedAllRead, {
        // Long enough to reach Undo by keyboard from the dialog.
        duration: 10_000,
        action:
          result.undoRevisions && result.ids?.length
            ? { label: labels.undo, onClick: () => void runUndo(result) }
            : undefined,
      });
    } catch {
      toast.error(labels.markAllError);
    }
  };

  return (
    <>
      <NotificationPanelHeader
        titleId={titleId}
        labels={labels}
        filter={filter}
        onFilter={setFilter}
        unreadCount={unreadCount}
        markAllPending={markAll.isPending}
        onMarkAll={onMarkAll}
        scopeAll={routeWsId ? scope === 'all' : undefined}
        onToggleScope={() => setScope(scope === 'all' ? 'workspace' : 'all')}
      />
      <div
        data-notification-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <NotificationList
          key={`${filter}:${wsId ?? 'all'}`}
          query={query}
          filter={filter}
          labels={labels}
          codeText={codeText}
          routeWsId={taskWsId}
          onToggle={onToggle}
          onShowAll={() => setFilter('all')}
          onNavigate={onClose}
        />
      </div>
      <div className="flex shrink-0 border-t bg-card px-2 py-1.5">
        <Link
          href={pageUrl}
          onClick={onClose}
          className="ml-auto inline-flex min-h-8 items-center gap-0.5 rounded-md px-2 font-medium text-sm hover:bg-accent pointer-coarse:min-h-11"
        >
          {labels.viewAll}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
