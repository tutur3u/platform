'use client';

import { ArrowUpRight, ChevronDown, Mail, MailOpen } from '@tuturuuu/icons';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
  /** Name of the app that opens this notification's item, if any. */
  openApp: string | null;
  hideOpenAction?: boolean;
  opening: boolean;
  onFocusRow: (id: string) => void;
  onToggle: (stack: NotificationStack) => void;
  onOpen: (stack: NotificationStack) => void;
  onInviteResolved: (stack: NotificationStack) => void;
  /** Adds a leading checkbox column; rows keep one grid in every state. */
  selection?: NotificationRowSelection;
}

export interface NotificationRowSelection {
  selected: boolean;
  /** Show the checkbox without hover, e.g. while any row is selected. */
  visible: boolean;
  label: string;
  onSelect: (stack: NotificationStack, range: boolean) => void;
}

export const NotificationCard = memo(function NotificationCard({
  stack,
  labels,
  codeText,
  tabbable,
  openApp,
  hideOpenAction = false,
  opening,
  onFocusRow,
  onToggle,
  onOpen,
  onInviteResolved,
  selection,
}: NotificationCardProps) {
  const { lead, unread } = stack;
  const [expanded, setExpanded] = useState(false);
  const text = notificationDisplayText(lead, codeText);
  const toggleLabel = unread ? labels.markAsRead : labels.markAsUnread;
  const age = formatNotificationAge(lead.created_at);
  const openLabel = openApp ? labels.openIn.replace('{app}', openApp) : null;

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
      title={openLabel ?? undefined}
      onFocus={(event) =>
        event.target === event.currentTarget && onFocusRow(lead.id)
      }
      onClick={onClick}
      data-selected={selection?.selected || undefined}
      className={cn(
        'group relative grid cursor-default items-start gap-2.5 rounded-lg py-2.5 pr-2 pl-1.5 outline-none',
        selection
          ? 'grid-cols-[1.25rem_0.5rem_2rem_minmax(0,1fr)_auto]'
          : 'grid-cols-[0.5rem_2rem_minmax(0,1fr)_auto]',
        'hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        'data-selected:bg-dynamic-blue/10',
        openApp && 'cursor-pointer'
      )}
    >
      {selection && (
        <Checkbox
          checked={selection.selected}
          aria-label={`${selection.label}: ${text.title}`}
          tabIndex={-1}
          onClick={(event) => {
            event.preventDefault();
            selection.onSelect(stack, event.shiftKey);
          }}
          className={cn(
            'mt-2 transition-opacity before:absolute before:-inset-3 before:content-[""]',
            'relative pointer-coarse:opacity-100',
            selection.visible || selection.selected
              ? 'opacity-100'
              : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
          )}
        />
      )}
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
        {openLabel && !hideOpenAction && (
          <button
            type="button"
            data-notification-open
            onClick={() => onOpen(stack)}
            className="mt-1.5 inline-flex min-h-6 items-center gap-1 rounded-md border px-2 font-medium text-foreground text-xs outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
          >
            {openLabel}
            <ArrowUpRight aria-hidden className="size-3.5" />
          </button>
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
    prev.openApp === next.openApp &&
    prev.hideOpenAction === next.hideOpenAction &&
    prev.opening === next.opening &&
    prev.onFocusRow === next.onFocusRow &&
    prev.onToggle === next.onToggle &&
    prev.onOpen === next.onOpen &&
    prev.onInviteResolved === next.onInviteResolved &&
    prev.selection?.selected === next.selection?.selected &&
    prev.selection?.visible === next.selection?.visible &&
    prev.selection?.label === next.selection?.label &&
    prev.selection?.onSelect === next.selection?.onSelect
  );
}
