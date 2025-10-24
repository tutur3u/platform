'use client';

import {
  type Notification,
  type NotificationType,
  useDeleteNotification,
  useMarkAllAsRead,
  useNotificationSubscription,
  useNotifications,
  useUpdateNotification,
} from '@/hooks/useNotifications';
import { Bell, Check, Filter, Trash2, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

dayjs.extend(relativeTime);

interface NotificationListProps {
  wsId: string;
  userId: string;
}

export default function NotificationList({
  wsId,
  userId,
}: NotificationListProps) {
  const t = useTranslations('notifications');
  const [selectedTypes, setSelectedTypes] = useState<NotificationType[]>([]);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Fetch notifications
  const { data, isLoading } = useNotifications({
    wsId,
    limit: pageSize,
    offset: page * pageSize,
    unreadOnly: showUnreadOnly,
    type: selectedTypes.length === 1 ? selectedTypes[0] : undefined,
  });

  // Mutations
  const updateNotification = useUpdateNotification();
  const deleteNotification = useDeleteNotification();
  const markAllAsRead = useMarkAllAsRead();

  // Subscribe to realtime updates
  useNotificationSubscription(wsId, userId);

  const handleMarkAsRead = (id: string, isUnread: boolean) => {
    updateNotification.mutate(
      { id, read: isUnread },
      {
        onSuccess: () => {
          toast.success(isUnread ? t('mark-as-read') : t('mark-as-unread'));
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteNotification.mutate(id, {
      onSuccess: () => {
        toast.success(t('delete'));
      },
    });
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate(wsId, {
      onSuccess: () => {
        toast.success(t('mark-all-read'));
      },
    });
  };

  const handleTypeToggle = (type: NotificationType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
    setPage(0); // Reset to first page when filter changes
  };

  const notifications = data?.notifications || [];
  const totalCount = data?.count || 0;
  const hasMore = (page + 1) * pageSize < totalCount;
  const hasPrevious = page > 0;

  const allTypes: NotificationType[] = [
    'task_assigned',
    'task_updated',
    'task_mention',
    'workspace_invite',
  ];

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-2xl">
            {t('notifications')}
            {totalCount > 0 && (
              <span className="ml-2 font-normal text-base text-foreground/60">
                ({totalCount})
              </span>
            )}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Type filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                {selectedTypes.length > 0
                  ? `${selectedTypes.length} selected`
                  : 'All types'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allTypes.map((type) => (
                <DropdownMenuCheckboxItem
                  key={type}
                  checked={selectedTypes.includes(type)}
                  onCheckedChange={() => handleTypeToggle(type)}
                >
                  {t(`types.${type}`)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Unread filter */}
          <Button
            variant={showUnreadOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setShowUnreadOnly(!showUnreadOnly);
              setPage(0);
            }}
          >
            Unread only
          </Button>

          {/* Mark all as read */}
          {notifications.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
              <Check className="mr-2 h-4 w-4" />
              {t('mark-all-read')}
            </Button>
          )}
        </div>
      </div>

      {/* Notifications list */}
      {isLoading ? (
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <Bell className="mb-4 h-12 w-12 text-foreground/20" />
            <p className="text-foreground/60 text-sm">
              Loading notifications...
            </p>
          </div>
        </Card>
      ) : notifications.length === 0 ? (
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <Bell className="mb-4 h-12 w-12 text-foreground/20" />
            <h3 className="mb-2 font-semibold text-lg">
              {t('no-notifications')}
            </h3>
            <p className="text-foreground/60 text-sm">
              {showUnreadOnly || selectedTypes.length > 0
                ? 'No notifications match your filters'
                : 'You will be notified here when something happens'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkAsRead={handleMarkAsRead}
              onDelete={handleDelete}
              t={t}
              wsId={wsId}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(hasMore || hasPrevious) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={!hasPrevious}
          >
            Previous
          </Button>
          <span className="text-foreground/60 text-sm">
            Page {page + 1} of {Math.ceil(totalCount / pageSize)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

interface NotificationCardProps {
  notification: Notification;
  onMarkAsRead: (id: string, isUnread: boolean) => void;
  onDelete: (id: string) => void;
  t: any;
  wsId: string;
}

function NotificationCard({
  notification,
  onMarkAsRead,
  onDelete,
  t,
  wsId,
}: NotificationCardProps) {
  const isUnread = !notification.read_at;

  // Build link to entity
  const entityLink = getEntityLink(notification, wsId);

  return (
    <Card
      className={`p-4 transition-all hover:shadow-md ${
        isUnread ? 'border-dynamic-blue/40 bg-dynamic-blue/5' : ''
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Type icon */}
        <div
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${
            isUnread ? 'bg-dynamic-blue/20' : 'bg-foreground/10'
          }`}
        >
          <span className="text-lg">
            {getNotificationIcon(notification.type)}
          </span>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Type badge and timestamp */}
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="text-foreground/60 uppercase tracking-wide">
              {t(`types.${notification.type}`)}
            </span>
            <span className="text-foreground/40">•</span>
            <span className="text-foreground/60">
              {dayjs(notification.created_at).fromNow()}
            </span>
          </div>

          {/* Title */}
          <h3 className="mb-1 font-semibold text-base leading-tight">
            {notification.title}
          </h3>

          {/* Description */}
          {notification.description && (
            <p className="mb-2 text-foreground/80 text-sm leading-relaxed">
              {notification.description}
            </p>
          )}

          {/* Action button */}
          {entityLink && (
            <Link href={entityLink}>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                View details →
              </Button>
            </Link>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-none items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onMarkAsRead(notification.id, isUnread)}
            title={isUnread ? t('mark-as-read') : t('mark-as-unread')}
          >
            {isUnread ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(notification.id)}
            title={t('delete')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function getNotificationIcon(type: string): string {
  switch (type) {
    case 'task_assigned':
      return '📋';
    case 'task_updated':
      return '✏️';
    case 'task_mention':
      return '👤';
    case 'workspace_invite':
      return '✉️';
    default:
      return '🔔';
  }
}

function getEntityLink(
  notification: Notification,
  wsId: string
): string | null {
  const { entity_type, entity_id, data } = notification;

  if (entity_type === 'task' && entity_id) {
    const boardId = data?.board_id;
    return boardId
      ? `/${wsId}/tasks/${boardId}?task=${entity_id}`
      : `/${wsId}/tasks?task=${entity_id}`;
  }

  if (entity_type === 'workspace' && entity_id) {
    return `/${entity_id}`;
  }

  return null;
}
