'use client';

import { Bell, Check, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';
import type { Notification } from '@/hooks/useNotifications';
import {
  useMarkAllAsRead,
  useNotificationSubscription,
  useNotifications,
  useUnreadCount,
  useUpdateNotification,
} from '@/hooks/useNotifications';

dayjs.extend(relativeTime);

interface EnhancedNotificationPopoverProps {
  wsId: string;
  userId: string;
}

export default function EnhancedNotificationPopover({
  wsId,
  userId,
}: EnhancedNotificationPopoverProps) {
  const t = useTranslations('notifications');
  const [open, setOpen] = useState(false);
  const [previousNotifications, setPreviousNotifications] = useState<
    Notification[]
  >([]);

  // Fetch notifications and unread count
  const { data: unreadCountData } = useUnreadCount(wsId);
  const { data: notificationsData, isLoading } = useNotifications({
    wsId,
    limit: 20,
    offset: 0,
  });

  // Mutations
  const updateNotification = useUpdateNotification();
  const markAllAsRead = useMarkAllAsRead();

  // Browser notifications
  const { permission, showNotification, requestPermission } =
    useBrowserNotifications();

  // Subscribe to realtime updates
  useNotificationSubscription(wsId, userId);

  // Show browser notifications for new notifications
  useEffect(() => {
    if (
      !notificationsData?.notifications ||
      previousNotifications.length === 0
    ) {
      if (notificationsData?.notifications) {
        setPreviousNotifications(notificationsData.notifications);
      }
      return;
    }

    // Find new notifications
    const newNotifications = notificationsData.notifications.filter(
      (n) => !previousNotifications.some((p) => p.id === n.id)
    );

    // Show browser notifications for new ones
    if (permission === 'granted') {
      newNotifications.forEach((notification) => {
        showNotification(notification);
      });
    }

    setPreviousNotifications(notificationsData.notifications);
  }, [
    notificationsData?.notifications,
    previousNotifications,
    permission,
    showNotification,
  ]);

  const handleMarkAsRead = (id: string, currentlyRead: boolean) => {
    updateNotification.mutate({ id, read: !currentlyRead });
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate(wsId);
  };

  const notifications = notificationsData?.notifications || [];
  const unreadCount = unreadCountData || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="group relative hidden flex-none transition-all md:flex"
        >
          <Bell className="h-6 w-6" />
          {unreadCount > 0 && (
            <div className="absolute top-1 right-2 flex h-1.5 w-1.5 flex-none items-center justify-center rounded-full bg-foreground p-1 text-center font-semibold text-foreground text-xs transition-all group-hover:-top-2 group-hover:-right-1 group-hover:h-4 group-hover:w-auto group-hover:text-background">
              <div className="relative opacity-0 group-hover:opacity-100">
                {unreadCount}
              </div>
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="font-semibold">
            {t('notifications')}
            {unreadCount > 0 && (
              <span className="ml-2 text-foreground/60 text-xs">
                {t('unread-count', { count: unreadCount })}
              </span>
            )}
          </div>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleMarkAllAsRead}
            >
              {t('mark-all-read')}
            </Button>
          )}
        </div>
        <Separator />

        {/* Browser notification permission banner */}
        {permission === 'default' && (
          <>
            <div className="bg-dynamic-blue/10 p-3">
              <div className="mb-2 font-medium text-sm">
                {t('browser.permission-request')}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={requestPermission}
              >
                {t('browser.enable')}
              </Button>
            </div>
            <Separator />
          </>
        )}

        {/* Notifications list */}
        <ScrollArea
          className={`p-2 ${
            notifications.length === 0
              ? 'h-20'
              : notifications.length > 3
                ? 'h-96'
                : ''
          }`}
        >
          {isLoading ? (
            <div className="flex min-h-16 flex-col items-center justify-center">
              <div className="text-foreground/80 text-xs">Loading...</div>
            </div>
          ) : notifications.length > 0 ? (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={(read) => handleMarkAsRead(notification.id, read)}
                t={t}
              />
            ))
          ) : (
            <div className="flex min-h-16 flex-col items-center justify-center">
              <div className="text-foreground/80 text-xs">
                {t('no-notifications')}
              </div>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (currentlyRead: boolean) => void;
  t: any;
}

function NotificationItem({
  notification,
  onMarkAsRead,
  t,
}: NotificationItemProps) {
  const isUnread = !notification.read_at;

  return (
    <div
      className={`mb-2 rounded-lg border p-3 transition-colors last:mb-0 ${
        isUnread
          ? 'border-dynamic-blue/20 bg-dynamic-blue/5'
          : 'bg-foreground/5'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          {/* Type badge */}
          <div className="mb-1 text-foreground/60 text-xs uppercase tracking-wide">
            {t(`types.${notification.type}`)}
          </div>

          {/* Title */}
          <div className="font-medium text-sm leading-none">
            {notification.title}
          </div>

          {/* Description */}
          {notification.description && (
            <div className="mt-1 text-foreground/80 text-xs">
              {notification.description}
            </div>
          )}

          {/* Timestamp */}
          <div className="mt-2 text-foreground/60 text-xs">
            {dayjs(notification.created_at).fromNow()}
          </div>
        </div>

        {/* Mark as read/unread button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-none"
          onClick={() => onMarkAsRead(isUnread)}
        >
          {isUnread ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
