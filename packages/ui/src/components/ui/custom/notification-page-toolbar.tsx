'use client';

import { CheckCheck, Globe, Loader2, Mail, MailOpen, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import type { NotificationFilter } from '@tuturuuu/ui/hooks/use-notifications';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode, Ref } from 'react';
import { fillCount } from './notification-labels';
import type { NotificationPageLabels } from './notification-page-labels';

export type NotificationGroupBy = 'time' | 'app';

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; text: string; extra?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-9',
              on
                ? 'bg-background font-medium text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.text}
            {option.extra}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The page toolbar is one fixed-height bar. A selection swaps its contents in
 * place, so rows never move when selection starts or ends.
 */
export function NotificationPageToolbar({
  labels,
  ready,
  filter,
  onFilter,
  unreadCount,
  groupBy,
  onGroupBy,
  scopeAll,
  onToggleScope,
  markAllPending,
  onMarkAll,
  selectedCount,
  selectableCount,
  onSelectAll,
  onClearSelection,
  selectAllRef,
  canMarkUnread,
  bulkPending,
  onBulkRead,
}: {
  labels: NotificationPageLabels;
  /** False until the first page loads; controls render but stay disabled. */
  ready: boolean;
  filter: NotificationFilter;
  onFilter: (filter: NotificationFilter) => void;
  unreadCount: number;
  groupBy: NotificationGroupBy;
  onGroupBy: (groupBy: NotificationGroupBy) => void;
  /** Undefined outside a workspace route, where the scope is always all. */
  scopeAll?: boolean;
  onToggleScope: () => void;
  markAllPending: boolean;
  onMarkAll: () => void;
  selectedCount: number;
  selectableCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  selectAllRef: Ref<HTMLButtonElement>;
  /** False in Unread, where every selected row is already unread. */
  canMarkUnread: boolean;
  bulkPending: boolean;
  onBulkRead: (read: boolean) => void;
}) {
  const selecting = selectedCount > 0;
  const allSelected = selecting && selectedCount === selectableCount;

  return (
    <div
      data-notification-toolbar
      className={cn(
        'sticky top-0 z-10 flex h-11 items-center gap-1.5 rounded-xl border px-2 backdrop-blur',
        selecting ? 'bg-accent/95' : 'bg-card/95'
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center">
        <Checkbox
          ref={selectAllRef}
          aria-label={labels.selectAll}
          disabled={!ready || selectableCount === 0}
          checked={allSelected ? true : selecting ? 'indeterminate' : false}
          onCheckedChange={() =>
            allSelected ? onClearSelection() : onSelectAll()
          }
        />
      </span>

      {selecting ? (
        <>
          <span
            role="status"
            className="shrink-0 px-1 font-medium text-sm tabular-nums"
          >
            {fillCount(labels.selectedCount, selectedCount)}
          </span>
          <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
          <Button
            size="sm"
            variant="ghost"
            disabled={bulkPending}
            onClick={() => onBulkRead(true)}
            aria-label={labels.markSelectionRead}
          >
            <MailOpen aria-hidden className="size-4" />
            <span className="hidden sm:inline">{labels.markSelectionRead}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={bulkPending || !canMarkUnread}
            onClick={() => onBulkRead(false)}
            aria-label={labels.markSelectionUnread}
          >
            <Mail aria-hidden className="size-4" />
            <span className="hidden sm:inline">
              {labels.markSelectionUnread}
            </span>
          </Button>
          {bulkPending && (
            <Loader2
              aria-hidden
              className="size-4 animate-spin text-muted-foreground"
            />
          )}
          <span className="flex-1" />
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={labels.clearSelection}
            title={`${labels.clearSelection} (Esc)`}
            onClick={onClearSelection}
          >
            <X aria-hidden className="size-4" />
          </Button>
        </>
      ) : (
        <>
          <Segment
            label={labels.notifications}
            value={filter}
            onChange={onFilter}
            options={[
              {
                value: 'unread',
                text: labels.unread,
                extra: (
                  // Reserved width: the count arriving never moves the tabs.
                  <span className="min-w-[2ch] text-left text-xs tabular-nums">
                    {ready && unreadCount > 0
                      ? unreadCount > 99
                        ? '99+'
                        : unreadCount
                      : ''}
                  </span>
                ),
              },
              { value: 'all', text: labels.all },
            ]}
          />
          <span className="flex-1" />
          <div className="hidden md:block">
            <Segment
              label={labels.groupBy}
              value={groupBy}
              onChange={onGroupBy}
              options={[
                { value: 'time', text: labels.groupTime },
                { value: 'app', text: labels.groupApp },
              ]}
            />
          </div>
          {scopeAll !== undefined && (
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={scopeAll}
              onClick={onToggleScope}
              className={cn(!scopeAll && 'text-muted-foreground')}
            >
              <Globe aria-hidden className="size-4" />
              <span className="hidden sm:inline">{labels.scopeAll}</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={!ready || unreadCount === 0 || markAllPending}
            onClick={onMarkAll}
            aria-label={labels.markAllRead}
          >
            {markAllPending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <CheckCheck aria-hidden className="size-4" />
            )}
            <span className="hidden sm:inline">{labels.markAllRead}</span>
          </Button>
        </>
      )}
    </div>
  );
}
