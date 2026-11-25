'use client';

import { CheckCheck, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { NotificationFilter } from '@tuturuuu/ui/hooks/use-notifications';
import { cn } from '@tuturuuu/utils/format';
import type { NotificationLabels } from './notification-labels';
import {
  NOTIFICATION_TAB_CLASS,
  NOTIFICATION_TAB_ROW_CLASS,
  NOTIFICATION_TITLE_CLASS,
  NOTIFICATION_TITLE_ROW_CLASS,
} from './notification-panel-frame';

/** Fixed header: title, Mark all read, Unread/All tabs and the scope toggle. */
export function NotificationPanelHeader({
  titleId,
  labels,
  filter,
  onFilter,
  unreadCount,
  markAllPending,
  onMarkAll,
  scopeAll,
  onToggleScope,
}: {
  titleId: string;
  labels: NotificationLabels;
  filter: NotificationFilter;
  onFilter: (filter: NotificationFilter) => void;
  unreadCount: number;
  markAllPending: boolean;
  onMarkAll: () => void;
  /** Undefined outside a workspace route, where the scope is always all. */
  scopeAll?: boolean;
  onToggleScope: () => void;
}) {
  const tab = (value: NotificationFilter, text: string, count?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={filter === value}
      onClick={() => onFilter(value)}
      className={cn(
        NOTIFICATION_TAB_CLASS,
        filter === value
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {text}
      {count !== undefined && (
        // Always rendered so the tabs after it keep their position whether or
        // not there is anything unread.
        <span className="inline-block min-w-[3ch] text-center text-xs tabular-nums">
          {count > 0 ? (count > 99 ? '99+' : count) : ''}
        </span>
      )}
    </button>
  );

  return (
    <>
      <div className={NOTIFICATION_TITLE_ROW_CLASS}>
        <h2 id={titleId} className={NOTIFICATION_TITLE_CLASS}>
          {labels.notifications}
        </h2>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 gap-1.5 text-xs pointer-coarse:min-h-11"
            disabled={markAllPending}
            onClick={onMarkAll}
          >
            {markAllPending ? (
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
            ) : (
              <CheckCheck aria-hidden className="size-3.5" />
            )}
            {labels.markAllRead}
          </Button>
        )}
      </div>
      <div className={NOTIFICATION_TAB_ROW_CLASS}>
        <div
          role="tablist"
          aria-label={labels.notifications}
          className="flex gap-1"
        >
          {tab('unread', labels.unread, unreadCount)}
          {tab('all', labels.all)}
        </div>
        {scopeAll !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={scopeAll}
            onClick={onToggleScope}
            className={cn(
              'ml-auto h-8 text-xs pointer-coarse:min-h-11',
              scopeAll ? 'bg-accent text-foreground' : 'text-muted-foreground'
            )}
          >
            {labels.scopeAll}
          </Button>
        )}
      </div>
    </>
  );
}
