'use client';

import type { UseMutationResult } from '@tanstack/react-query';
import { ChevronDown, Eye, EyeOff, Loader2, User } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { DescriptionDiffViewer } from '@/components/tasks/description-diff-viewer';
import type { Notification } from '@/hooks/useNotifications';
import {
  formatFieldName,
  formatValue,
  getEntityLink,
  type TranslationFn,
} from './notification-utils';

dayjs.extend(relativeTime);

interface NotificationGroupCardProps {
  notifications: Notification[];
  onMarkAsRead: (id: string, isUnread: boolean) => void;
  t: TranslationFn;
  wsId: string;
  updateNotification: UseMutationResult<
    void,
    Error,
    { id: string; read: boolean }
  >;
  onMarkAllAsRead: () => Promise<void>;
  index?: number;
}

export function NotificationGroupCard({
  notifications,
  onMarkAsRead,
  t,
  wsId,
  updateNotification,
  onMarkAllAsRead,
  index = 0,
}: NotificationGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasUnread = notifications.some((n) => !n.read_at);

  const firstNotification = notifications[0];
  const taskName = firstNotification?.data?.task_name || 'Task';
  const entityLink = firstNotification
    ? getEntityLink(firstNotification, wsId)
    : null;

  // Create a summary of notification types
  const typeCount = notifications.reduce(
    (acc, n) => {
      const type = n.type || 'update';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const summaryText = Object.entries(typeCount)
    .slice(0, 3)
    .map(([type, count]) => {
      const typeLabel = t(`types.${type}`);
      return count > 1 ? `${count}× ${typeLabel}` : typeLabel;
    })
    .join(', ');

  // Find description changes
  const descriptionChanges = notifications
    .map((n) => {
      if (n.data?.changes?.description) {
        return {
          id: n.id,
          oldValue: n.data.changes.description.old,
          newValue: n.data.changes.description.new,
        };
      }
      if (
        n.type === 'task_description_changed' &&
        (n.data?.old_value || n.data?.new_value)
      ) {
        return {
          id: n.id,
          oldValue: n.data.old_value,
          newValue: n.data.new_value,
        };
      }
      return null;
    })
    .filter(Boolean) as Array<{
    id: string;
    oldValue: unknown;
    newValue: unknown;
  }>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.05,
        ease: [0.23, 1, 0.32, 1],
      }}
      className={cn(
        'group relative overflow-hidden rounded-xl border transition-all duration-200',
        hasUnread
          ? 'border-dynamic-blue/20 bg-dynamic-blue/3'
          : 'border-foreground/5 bg-foreground/1 hover:border-foreground/10'
      )}
    >
      {/* Unread indicator */}
      {hasUnread && (
        <div className="absolute top-4 bottom-4 left-0 w-0.5 rounded-full bg-dynamic-blue" />
      )}

      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-start gap-3 p-4">
          {/* Stacked avatars with type icon badge */}
          <div className="relative flex-none">
            {/* Stacked avatars for unique actors */}
            <div className="flex -space-x-2">
              {(() => {
                // Deduplicate actors by ID and sort: avatars first, then alphabetically
                const uniqueActors = notifications
                  .reduce(
                    (acc, n) => {
                      const actorId = n.actor?.id || n.id;
                      if (!acc.seen.has(actorId)) {
                        acc.seen.add(actorId);
                        acc.items.push(n);
                      }
                      return acc;
                    },
                    {
                      seen: new Set<string>(),
                      items: [] as typeof notifications,
                    }
                  )
                  .items.sort((a, b) => {
                    // Prioritize actors with avatars
                    const aHasAvatar = a.actor?.avatar_url ? 1 : 0;
                    const bHasAvatar = b.actor?.avatar_url ? 1 : 0;
                    if (bHasAvatar !== aHasAvatar)
                      return bHasAvatar - aHasAvatar;
                    // Then sort alphabetically by name for consistency
                    const aName = a.actor?.display_name || '';
                    const bName = b.actor?.display_name || '';
                    return aName.localeCompare(bName);
                  });

                return uniqueActors.slice(0, 3).map((n, idx) => (
                  <Avatar
                    key={n.actor?.id || n.id}
                    className="h-8 w-8 ring-2 ring-background"
                    style={{ zIndex: 3 - idx }}
                  >
                    {n.actor?.avatar_url ? (
                      <AvatarImage
                        src={n.actor.avatar_url}
                        alt={n.actor.display_name || 'User'}
                      />
                    ) : null}
                    <AvatarFallback
                      className={cn(
                        'font-medium text-xs',
                        hasUnread
                          ? 'bg-dynamic-blue text-white'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {n.actor?.display_name ? (
                        n.actor.display_name
                          .split(' ')
                          .map((name) => name[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)
                      ) : (
                        <User className="h-3 w-3" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                ));
              })()}
            </div>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            {/* Header */}
            <CollapsibleTrigger asChild>
              <button type="button" className="w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    {/* Count badge */}
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center justify-center rounded-full px-2 py-0.5 font-medium text-xs',
                          hasUnread
                            ? 'bg-dynamic-blue/15 text-dynamic-blue'
                            : 'bg-foreground/10 text-foreground/60'
                        )}
                      >
                        {notifications.length} {t('updates')}
                      </span>
                      <span className="text-foreground/40 text-xs">
                        {dayjs(firstNotification?.created_at).fromNow()}
                      </span>
                    </div>

                    {/* Task name */}
                    <h3
                      className={cn(
                        'mb-1 font-medium text-sm leading-snug',
                        hasUnread ? 'text-foreground' : 'text-foreground/80'
                      )}
                    >
                      {taskName}
                    </h3>

                    {/* Summary */}
                    <p className="text-foreground/50 text-xs">{summaryText}</p>
                  </div>

                  {/* Expand icon */}
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-1 text-foreground/30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </motion.div>
                </div>
              </button>
            </CollapsibleTrigger>

            {/* Description diff viewers */}
            {descriptionChanges.length > 0 && !isExpanded && (
              <div className="mt-2 flex flex-wrap gap-2">
                {descriptionChanges.slice(0, 2).map((change, idx) => (
                  <DescriptionDiffViewer
                    key={change.id}
                    oldValue={change.oldValue}
                    newValue={change.newValue}
                    t={t}
                    triggerVariant="inline"
                    trigger={
                      <span className="inline-flex cursor-pointer items-center gap-1 text-dynamic-blue text-xs hover:underline">
                        <Eye className="h-3 w-3" />
                        {t('view_changes')}{' '}
                        {descriptionChanges.length > 1 ? `#${idx + 1}` : ''}
                      </span>
                    }
                  />
                ))}
              </div>
            )}

            {/* Expanded content */}
            <CollapsibleContent>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-4 space-y-2 border-foreground/5 border-t pt-4"
                  >
                    {notifications.map((notification, idx) => (
                      <GroupedNotificationItem
                        key={notification.id}
                        notification={notification}
                        onMarkAsRead={onMarkAsRead}
                        t={t}
                        index={idx}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </CollapsibleContent>

            {/* View task link */}
            {entityLink && (
              <Link href={entityLink} className="mt-3 inline-block">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-foreground/50 text-xs hover:text-dynamic-blue"
                >
                  {t('view_task')} →
                </Button>
              </Link>
            )}
          </div>

          {/* Group actions */}
          {hasUnread && (
            <div
              className={cn(
                'flex flex-none transition-opacity duration-200',
                updateNotification.isPending
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              )}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-foreground/40 hover:bg-foreground/5 hover:text-foreground"
                onClick={onMarkAllAsRead}
                title={t('mark-all-read')}
                disabled={updateNotification.isPending}
              >
                {updateNotification.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </Collapsible>
    </motion.div>
  );
}

// ============================================================================
// Grouped Notification Item
// ============================================================================

interface GroupedNotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string, isUnread: boolean) => void;
  t: TranslationFn;
  index: number;
}

function GroupedNotificationItem({
  notification,
  onMarkAsRead,
  t,
  index,
}: GroupedNotificationItemProps) {
  const isUnread = !notification.read_at;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className={cn(
        'group/item flex items-start gap-3 rounded-lg p-2.5 transition-colors',
        isUnread ? 'bg-dynamic-blue/5' : 'bg-foreground/2'
      )}
    >
      {/* Mini avatar with type badge */}
      <div className="relative flex-none">
        <Avatar className="h-6 w-6">
          {notification.actor?.avatar_url ? (
            <AvatarImage
              src={notification.actor.avatar_url}
              alt={notification.actor.display_name || 'User'}
            />
          ) : null}
          <AvatarFallback
            className={cn(
              'font-medium text-[10px]',
              isUnread
                ? 'bg-dynamic-blue text-white'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {notification.actor?.display_name ? (
              notification.actor.display_name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)
            ) : (
              <User className="h-3 w-3" />
            )}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm leading-snug',
            isUnread ? 'text-foreground/90' : 'text-foreground/70'
          )}
        >
          {notification.title}
        </p>

        {notification.description && (
          <p className="mt-0.5 text-foreground/50 text-xs">
            {notification.description}
          </p>
        )}

        {/* Change details */}
        {notification.data?.changes && (
          <div className="mt-1.5">
            <MiniChangeDetails
              changes={notification.data.changes}
              t={t}
              notificationData={notification.data}
            />
            {/* Description diff viewer for description changes */}
            {notification.data.changes.description && (
              <div className="mt-1">
                <DescriptionDiffViewer
                  oldValue={notification.data.changes.description.old}
                  newValue={notification.data.changes.description.new}
                  t={t}
                  triggerVariant="inline"
                />
              </div>
            )}
          </div>
        )}

        {/* Single change type description diff */}
        {notification.type === 'task_description_changed' &&
          !notification.data?.changes &&
          (notification.data?.old_value != null ||
            notification.data?.new_value != null) && (
            <div className="mt-1.5">
              <DescriptionDiffViewer
                oldValue={notification.data.old_value}
                newValue={notification.data.new_value}
                t={t}
                triggerVariant="inline"
              />
            </div>
          )}

        <p className="mt-1 text-foreground/30 text-xs">
          {dayjs(notification.created_at).fromNow()}
        </p>
      </div>

      {/* Read toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 flex-none opacity-0 transition-opacity group-hover/item:opacity-100"
        onClick={() => onMarkAsRead(notification.id, isUnread)}
        title={isUnread ? t('mark-as-read') : t('mark-as-unread')}
      >
        {isUnread ? (
          <EyeOff className="h-3 w-3" />
        ) : (
          <Eye className="h-3 w-3" />
        )}
      </Button>
    </motion.div>
  );
}

// ============================================================================
// Mini Change Details (for grouped view)
// ============================================================================

function MiniChangeDetails({
  changes,
  notificationData,
}: {
  changes: Record<string, { old: unknown; new: unknown }>;
  t?: TranslationFn;
  notificationData?: Record<string, unknown>;
}) {
  const changeEntries = Object.entries(changes);
  if (changeEntries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {changeEntries.slice(0, 2).map(([field, change]) => {
        // For list_id changes, use list names from notification data
        const isListIdChange = field === 'list_id';
        const displayOldValue = isListIdChange
          ? (notificationData?.old_list_name as string) || 'Unknown'
          : formatValue(change.old, field);
        const displayNewValue = isListIdChange
          ? (notificationData?.new_list_name as string) || 'Unknown'
          : formatValue(change.new, field);

        return (
          <span
            key={field}
            className="inline-flex items-center gap-1 rounded bg-foreground/5 px-1.5 py-0.5 text-xs"
          >
            <span className="text-foreground/50">
              {formatFieldName(field)}:
            </span>
            <span className="text-red-500/70 line-through">
              {displayOldValue.slice(0, 15)}
            </span>
            <span className="text-foreground/30">→</span>
            <span className="text-green-600/80">
              {displayNewValue.slice(0, 15)}
            </span>
          </span>
        );
      })}
      {changeEntries.length > 2 && (
        <span className="text-foreground/40 text-xs">
          +{changeEntries.length - 2} more
        </span>
      )}
    </div>
  );
}
