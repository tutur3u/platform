'use client';

import {
  useMarkAllAsRead,
  useNotificationSubscription,
  useNotifications,
  useUpdateNotification,
} from '@/hooks/useNotifications';
import { NotificationCard } from './notification-card';
import { NotificationEmpty, NotificationSkeleton } from './notification-empty';
import {
  DateGroupHeader,
  NotificationFilters,
  NotificationPagination,
} from './notification-filters';
import { NotificationGroupCard } from './notification-group';
import {
  filterNotificationsByTab,
  groupNotificationsByDate,
  groupNotificationsByEntity,
  MENTION_TYPES,
  type NotificationTab,
  TASK_TYPES,
  type TranslationFn,
} from './notification-utils';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from '@tuturuuu/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

interface NotificationListProps {
  wsId: string | null;
  userId: string;
  currentWsId?: string;
}

export default function NotificationList({
  wsId,
  userId,
  currentWsId,
}: NotificationListProps) {
  const tRaw = useTranslations('notifications');
  const queryClient = useQueryClient();

  // Wrap translation function for compatibility
  const t: TranslationFn = useCallback(
    (key: string, options?: Record<string, unknown>) => {
      try {
        return tRaw(key as any, options as any);
      } catch {
        return key;
      }
    },
    [tRaw]
  );

  // State
  const [activeTab, setActiveTab] = useState<NotificationTab>('all');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Determine if we need unread filter based on tab
  const unreadOnly = activeTab === 'unread';

  // Get type filter based on tab
  const typeFilter = useMemo(() => {
    if (activeTab === 'mentions') return MENTION_TYPES[0];
    if (activeTab === 'tasks') return TASK_TYPES[0];
    return undefined;
  }, [activeTab]);

  // Fetch notifications
  const { data, isLoading } = useNotifications({
    wsId: wsId || undefined,
    limit: pageSize,
    offset: page * pageSize,
    unreadOnly,
    type: typeFilter,
  });

  // Mutations
  const updateNotification = useUpdateNotification();
  const markAllAsRead = useMarkAllAsRead();

  // Subscribe to realtime updates
  useNotificationSubscription(currentWsId || null, userId);

  // Handlers
  const handleMarkAsRead = (id: string, isUnread: boolean) => {
    updateNotification.mutate(
      { id, read: isUnread },
      {
        onSuccess: () => {
          toast.success(isUnread ? t('mark-as-read') : t('mark-as-unread'));
        },
        onError: (error) => {
          console.error('Failed to update notification:', error);
          toast.error('Failed to update notification');
        },
      }
    );
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate(wsId || undefined, {
      onSuccess: () => {
        toast.success(t('mark-all-read'));
      },
    });
  };

  const handleTabChange = (tab: NotificationTab) => {
    setActiveTab(tab);
    setPage(0);
  };

  // Process notifications
  const notifications = data?.notifications || [];
  const totalCount = data?.count || 0;
  const hasMore = (page + 1) * pageSize < totalCount;
  const hasPrevious = page > 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Filter and group notifications
  const filteredNotifications = useMemo(() => {
    return filterNotificationsByTab(notifications, activeTab);
  }, [notifications, activeTab]);

  const entityGroups = useMemo(() => {
    return groupNotificationsByEntity(filteredNotifications);
  }, [filteredNotifications]);

  const dateGroups = useMemo(() => {
    return groupNotificationsByDate(entityGroups, t);
  }, [entityGroups, t]);

  // Counts for tabs
  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const mentionCount = notifications.filter((n) =>
    MENTION_TYPES.includes(n.type)
  ).length;
  const taskCount = notifications.filter((n) =>
    TASK_TYPES.includes(n.type)
  ).length;

  // Group action handler
  const handleGroupMarkAllAsRead = async (notificationIds: string[]) => {
    const unreadIds = notificationIds.filter(
      (id) => !notifications.find((n) => n.id === id)?.read_at
    );

    if (unreadIds.length === 0) return;

    for (const id of unreadIds) {
      try {
        await updateNotification.mutateAsync({ id, read: true });
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
      }
    }

    await queryClient.invalidateQueries({
      queryKey: ['notifications'],
      refetchType: 'active',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className="flex items-center gap-3"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-dynamic-blue/20 to-dynamic-purple/20 text-dynamic-blue">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-semibold text-foreground text-xl">
            {t('notifications')}
          </h1>
          {totalCount > 0 && (
            <p className="text-foreground/50 text-sm">
              {totalCount} {t('total_notifications')}
            </p>
          )}
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
      >
        <NotificationFilters
          activeTab={activeTab}
          onTabChange={handleTabChange}
          unreadCount={unreadCount}
          mentionCount={mentionCount}
          taskCount={taskCount}
          onMarkAllAsRead={handleMarkAllAsRead}
          isMarkingAllRead={markAllAsRead.isPending}
          t={t}
        />
      </motion.div>

      {/* Content */}
      {isLoading ? (
        <NotificationSkeleton />
      ) : filteredNotifications.length === 0 ? (
        <NotificationEmpty
          tab={activeTab}
          hasFilters={activeTab !== 'all'}
          t={t}
        />
      ) : (
        <div className="space-y-8">
          {dateGroups.map((dateGroup) => (
            <div key={dateGroup.key}>
              {/* Date header */}
              <DateGroupHeader
                label={dateGroup.label}
                count={dateGroup.notifications.reduce(
                  (acc, g) => acc + g.notifications.length,
                  0
                )}
              />

              {/* Notifications */}
              <div className="space-y-2">
                {dateGroup.notifications.map((group, groupIndex) =>
                  group.notifications.length > 1 ? (
                    <NotificationGroupCard
                      key={group.key}
                      notifications={group.notifications}
                      onMarkAsRead={handleMarkAsRead}
                      t={t}
                      wsId={currentWsId || wsId || ''}
                      updateNotification={updateNotification}
                      onMarkAllAsRead={() =>
                        handleGroupMarkAllAsRead(
                          group.notifications.map((n) => n.id)
                        )
                      }
                      index={groupIndex}
                    />
                  ) : group.notifications[0] ? (
                    <NotificationCard
                      key={group.notifications[0].id}
                      notification={group.notifications[0]}
                      onMarkAsRead={handleMarkAsRead}
                      t={t}
                      wsId={currentWsId || wsId || ''}
                      isUpdating={
                        updateNotification.isPending &&
                        updateNotification.variables?.id ===
                          group.notifications[0].id
                      }
                      onActionComplete={() => {
                        queryClient.invalidateQueries({
                          queryKey: ['notifications'],
                        });
                      }}
                      index={groupIndex}
                    />
                  ) : null
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <NotificationPagination
        page={page}
        totalPages={totalPages}
        hasMore={hasMore}
        hasPrevious={hasPrevious}
        onNextPage={() => setPage((p) => p + 1)}
        onPreviousPage={() => setPage((p) => p - 1)}
        onGoToPage={(p) => setPage(p)}
        t={t}
      />
    </div>
  );
}
