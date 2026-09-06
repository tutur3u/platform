'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronRight, Inbox, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  dedupeNotifications,
  useInfiniteNotifications,
  useMarkAllAsRead,
  useNotificationSubscription,
  useUnreadCount,
  useUpdateNotification,
} from '@tuturuuu/ui/hooks/use-notifications';
import { Popover, PopoverContent } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState } from 'react';
import { NotificationList } from './notification-list';
import { NotificationPopoverTriggerButton } from './notification-popover-trigger';
import { useNotificationRuntime } from './notification-runtime';

dayjs.extend(relativeTime);
type TabType = 'inbox' | 'archive';

export interface NotificationPopoverClientProps {
  userId?: string;
  noNotificationsText: string;
  notificationsText: string;
  viewAllText: string;
  markAsReadText: string;
  markAsUnreadText: string;
  inboxText?: string;
  archiveText?: string;
  archiveAllText?: string;
  emptyArchiveText?: string;
  loadingMoreText?: string;
  retryText?: string;
  acceptText?: string;
  declineText?: string;
  acceptedText?: string;
  declinedText?: string;
  /** Base URL for external redirect (e.g. 'https://tuturuuu.com'). When set, "View All" links to {webAppUrl}/{wsId}/notifications. */
  webAppUrl?: string;
}

// Workspace identifier validation regex
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const SPECIAL_WORKSPACE_SLUGS = new Set(['personal', 'internal']);

function isValidWorkspaceIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (UUID_REGEX.test(value) || SPECIAL_WORKSPACE_SLUGS.has(value))
  );
}

function isValidWorkspaceFilterId(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export default function SatelliteNotificationPopover({
  userId,
  noNotificationsText,
  notificationsText,
  viewAllText,
  markAsReadText,
  markAsUnreadText,
  inboxText = 'Inbox',
  archiveText = 'Archive',
  archiveAllText = 'Archive all',
  emptyArchiveText = 'No archived notifications yet.',
  loadingMoreText = 'Loading more...',
  retryText = 'Retry',
  acceptText = 'Accept',
  declineText = 'Decline',
  acceptedText = 'Joined',
  declinedText = 'Declined',
  webAppUrl,
}: NotificationPopoverClientProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('inbox');
  const { params, Link, realtime } = useNotificationRuntime();
  const queryClient = useQueryClient();

  const workspaceIdParam =
    typeof params.wsId === 'string' ? params.wsId : undefined;
  const wsIdForFiltering = isValidWorkspaceFilterId(workspaceIdParam)
    ? workspaceIdParam
    : undefined;
  const wsIdForTaskContext = isValidWorkspaceIdentifier(workspaceIdParam)
    ? workspaceIdParam
    : undefined;

  // Accurate unread count from dedicated endpoint
  const { data: unreadCount = 0 } = useUnreadCount(wsIdForFiltering, {
    cacheScope: userId,
    enabled: Boolean(userId),
    refetchInterval: realtime ? undefined : 30_000,
  });

  // Infinite scroll for inbox (unread) and archive (read)
  const inboxQuery = useInfiniteNotifications({
    cacheScope: userId,
    wsId: wsIdForFiltering,
    unreadOnly: true,
    pageSize: 15,
    refetchInterval: realtime ? undefined : 30_000,
    enabled: Boolean(userId) && open && activeTab === 'inbox',
  });

  const archiveQuery = useInfiniteNotifications({
    cacheScope: userId,
    wsId: wsIdForFiltering,
    readOnly: true,
    pageSize: 15,
    refetchInterval: realtime ? undefined : 30_000,
    enabled: Boolean(userId) && open && activeTab === 'archive',
  });

  const markAllAsRead = useMarkAllAsRead();
  const updateNotification = useUpdateNotification();

  // Subscribe to realtime updates
  useNotificationSubscription(
    wsIdForFiltering || '',
    realtime ? userId || '' : ''
  );

  const activeQuery = activeTab === 'inbox' ? inboxQuery : archiveQuery;
  const allNotifications = dedupeNotifications(
    activeQuery.data?.pages.flatMap((p) => p.notifications) ?? []
  );
  const hasNotifications = allNotifications.length > 0;

  // When webAppUrl is set, link to the external web app's notifications page
  const baseUrl = webAppUrl ?? '';
  const notificationsPageUrl = params.wsId
    ? `${baseUrl}/${params.wsId}/notifications`
    : `${baseUrl}/notifications`;

  const handleMarkAsRead = async (id: string, isUnread: boolean) => {
    try {
      await updateNotification.mutateAsync({ id, read: isUnread });
    } catch (error) {
      console.error('Failed to update notification:', error);
      toast.error('Failed to update notification');
    }
  };

  const handleArchiveAll = async () => {
    try {
      await markAllAsRead.mutateAsync(wsIdForFiltering);
      toast.success('All notifications archived');
    } catch (error) {
      console.error('Failed to archive all:', error);
      toast.error('Failed to archive notifications');
    }
  };

  if (!userId) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <NotificationPopoverTriggerButton
        notificationsText={notificationsText}
        unreadCount={unreadCount}
      />
      <PopoverContent
        className="w-100 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border p-0 shadow-xl"
        align="end"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-background px-4 py-3">
          <h3 className="font-semibold text-base">{notificationsText}</h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-foreground/60 text-xs hover:text-foreground"
                onClick={handleArchiveAll}
                disabled={markAllAsRead.isPending}
              >
                {markAllAsRead.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Archive className="h-3 w-3" />
                )}
                {archiveAllText}
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-background">
          <button
            type="button"
            onClick={() => setActiveTab('inbox')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 font-medium text-sm transition-colors',
              activeTab === 'inbox'
                ? 'border-primary border-b-2 text-primary'
                : 'text-foreground/50 hover:text-foreground/80'
            )}
          >
            <Inbox className="h-3.5 w-3.5" />
            {inboxText}
            {unreadCount > 0 && (
              <span className="rounded-full bg-dynamic-red/10 px-1.5 py-0.5 font-semibold text-[10px] text-dynamic-red leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('archive')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 font-medium text-sm transition-colors',
              activeTab === 'archive'
                ? 'border-primary border-b-2 text-primary'
                : 'text-foreground/50 hover:text-foreground/80'
            )}
          >
            <Archive className="h-3.5 w-3.5" />
            {archiveText}
          </button>
        </div>

        {/* Notification List with Infinite Scroll — key forces remount on tab switch to reset scroll */}
        <NotificationList
          key={activeTab}
          query={activeQuery}
          notifications={allNotifications}
          hasNotifications={hasNotifications}
          activeTab={activeTab}
          wsId={wsIdForTaskContext}
          noNotificationsText={noNotificationsText}
          emptyArchiveText={emptyArchiveText}
          loadingMoreText={loadingMoreText}
          retryText={retryText}
          acceptText={acceptText}
          declineText={declineText}
          acceptedText={acceptedText}
          declinedText={declinedText}
          markAsReadText={markAsReadText}
          markAsUnreadText={markAsUnreadText}
          onMarkAsRead={handleMarkAsRead}
          queryClient={queryClient}
          onActionComplete={() => setOpen(false)}
        />

        {/* Footer with View All */}
        <div className="border-t bg-background">
          <Link
            href={notificationsPageUrl}
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 font-medium text-sm transition-colors hover:rounded-b-xl hover:bg-foreground/5"
          >
            {viewAllText}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
