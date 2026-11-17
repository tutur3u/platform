'use client';

import { ChevronDown, Mail, MailOpen } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { memo, type MouseEvent, useState } from 'react';
import { NotificationInviteActions } from './notification-card-actions';
import {
  type NotificationCodeText,
  notificationDisplayText,
} from './notification-code-text';
import type { NotificationStack } from './notification-grouping';
import { fillCount, type NotificationLabels } from './notification-labels';
import {
  formatNotificationAge,
  NotificationLeading as Leading,
} from './notification-leading';

export interface NotificationCardProps {
  stack: NotificationStack;
  labels: NotificationLabels;
  codeText?: NotificationCodeText;
  tabbable: boolean;
  canOpen: boolean;
  opening: boolean;
  onFocusRow: (id: string) => void;
  onToggle: (stack: NotificationStack) => void;
  onOpen: (stack: NotificationStack) => void;
  onInviteResolved: (stack: NotificationStack) => void;
}

export const NotificationCard = memo(function NotificationCard({
  stack,
  labels,
  codeText,
  tabbable,
  canOpen,
  opening,
  onFocusRow,
  onToggle,
  onOpen,
  onInviteResolved,
}: NotificationCardProps) {
  const { lead, unread } = stack;
  const [expanded, setExpanded] = useState(false);
  const text = notificationDisplayText(lead, codeText);
  const toggleLabel = unread ? labels.markAsRead : labels.markAsUnread;
  const age = formatNotificationAge(lead.created_at);

  const onClick = (event: MouseEvent<HTMLLIElement>) => {
    if ((event.target as HTMLElement).closest('button, a')) return;
    onOpen(stack);
  };

  return (
    <li
      data-notification-row={lead.id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`${unread ? `${labels.unread}. ` : ''}${text.title}, ${age}`}
      aria-keyshortcuts="E Enter"
      title={canOpen ? labels.viewDetails : undefined}
      onFocus={(event) =>
        event.target === event.currentTarget && onFocusRow(lead.id)
      }
      onClick={onClick}
      className={cn(
        'group relative grid cursor-default grid-cols-[0.5rem_2rem_minmax(0,1fr)_auto] items-start gap-2.5 rounded-lg py-2.5 pr-2 pl-1.5 outline-none',
        'hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        canOpen && 'cursor-pointer'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-3 size-2 rounded-full',
          unread ? 'bg-dynamic-blue' : 'bg-transparent'
        )}
      />
      <Leading notification={lead} />
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm leading-snug',
            unread ? 'font-medium text-foreground' : 'text-muted-foreground'
          )}
        >
          {text.title}
        </p>
        {text.description && (
          <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
            {text.description}
          </p>
        )}
        {lead.data?.workspace_name && (
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            {lead.data.workspace_name}
          </p>
        )}
        {stack.rest.length > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="mt-1 inline-flex min-h-6 items-center gap-1 rounded text-muted-foreground text-xs hover:text-foreground pointer-coarse:min-h-11"
          >
            <ChevronDown
              aria-hidden
              className={cn('size-3.5', expanded && 'rotate-180')}
            />
            {fillCount(labels.updates, stack.ids.length)}
          </button>
        )}
        {expanded && (
          <ul className="mt-1 space-y-0.5 border-l pl-2 text-muted-foreground text-xs">
            {stack.rest.map((n) => (
              <li key={n.id}>
                {notificationDisplayText(n, codeText).title} ·{' '}
                {formatNotificationAge(n.created_at)}
              </li>
            ))}
          </ul>
        )}
        {lead.type === 'workspace_invite' && (
          <NotificationInviteActions
            notification={lead}
            labels={labels}
            onResolved={() => onInviteResolved(stack)}
          />
        )}
        {opening && (
          <p role="status" className="mt-1 text-muted-foreground text-xs">
            {labels.opening}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <time
          dateTime={lead.created_at}
          className="whitespace-nowrap text-muted-foreground text-xs tabular-nums"
        >
          {age}
        </time>
        {/* 44px hit area around a 32px visual, always visible and labelled. */}
        <button
          type="button"
          data-notification-toggle
          aria-label={toggleLabel}
          title={`${toggleLabel} (E)`}
          onClick={() => onToggle(stack)}
          className="group/toggle -my-1.5 -mr-1.5 flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-8 items-center justify-center rounded-md group-hover/toggle:bg-background/80">
            {unread ? (
              <MailOpen aria-hidden className="size-4" />
            ) : (
              <Mail aria-hidden className="size-4" />
            )}
          </span>
        </button>
      </div>
    </li>
  );
}, sameRow);

/**
 * Rows re-render only when their own data or state changes. Query structural
 * sharing keeps untouched notifications referentially stable across updates.
 */
function sameRow(prev: NotificationCardProps, next: NotificationCardProps) {
  const a = prev.stack;
  const b = next.stack;
  return (
    a.lead === b.lead &&
    a.unread === b.unread &&
    a.ids.length === b.ids.length &&
    a.rest.every((n, i) => n === b.rest[i]) &&
    prev.labels === next.labels &&
    prev.codeText === next.codeText &&
    prev.tabbable === next.tabbable &&
    prev.canOpen === next.canOpen &&
    prev.opening === next.opening &&
    prev.onFocusRow === next.onFocusRow &&
    prev.onToggle === next.onToggle &&
    prev.onOpen === next.onOpen &&
    prev.onInviteResolved === next.onInviteResolved
  );
}
