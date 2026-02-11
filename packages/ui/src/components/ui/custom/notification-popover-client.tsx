'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  AtSign,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Edit3,
  Eye,
  EyeOff,
  Inbox,
  Loader2,
  Mail,
  RotateCcw,
  Shield,
  UserPlus,
  X,
  XCircle,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  type Notification,
  useInfiniteNotifications,
  useMarkAllAsRead,
  useNotificationSubscription,
  useUnreadCount,
  useUpdateNotification,
} from '@tuturuuu/ui/hooks/use-notifications';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

dayjs.extend(relativeTime);

type TabType = 'inbox' | 'archive';

interface NotificationPopoverClientProps {
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
  /** Base URL for external redirect (e.g. 'https://tuturuuu.com'). When set, "View All" links to {webAppUrl}/{wsId}/notifications. */
  webAppUrl?: string;
}

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export default function NotificationPopoverClient({
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
  webAppUrl,
}: NotificationPopoverClientProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('inbox');
  const params = useParams();
  const queryClient = useQueryClient();

  const wsId = isValidUUID(params.wsId) ? params.wsId : undefined;

  // Accurate unread count from dedicated endpoint
  const { data: unreadCount = 0 } = useUnreadCount(wsId);

  // Infinite scroll for inbox (unread) and archive (read)
  const inboxQuery = useInfiniteNotifications({
    wsId,
    unreadOnly: true,
    pageSize: 15,
  });

  const archiveQuery = useInfiniteNotifications({
    wsId,
    readOnly: true,
    pageSize: 15,
  });

  const markAllAsRead = useMarkAllAsRead();
  const updateNotification = useUpdateNotification();

  // Subscribe to realtime updates
  useNotificationSubscription(wsId || '', userId || '');

  const activeQuery = activeTab === 'inbox' ? inboxQuery : archiveQuery;
  const allNotifications =
    activeQuery.data?.pages.flatMap((p) => p.notifications) ?? [];
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
      await markAllAsRead.mutateAsync(wsId);
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
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="group relative hidden flex-none transition-all md:flex"
        >
          <Bell className="h-6 w-6" />
          {unreadCount > 0 && (
            <div className="absolute top-1 right-2 flex h-1.5 w-1.5 flex-none items-center justify-center rounded-full bg-dynamic-red p-1 text-center font-semibold text-xs transition-all group-hover:-top-2 group-hover:-right-1 group-hover:h-5 group-hover:w-auto group-hover:px-1.5 group-hover:text-background">
              <div className="relative opacity-0 group-hover:opacity-100">
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-100 overflow-hidden rounded-xl border p-0 shadow-xl"
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
          wsId={wsId}
          noNotificationsText={noNotificationsText}
          emptyArchiveText={emptyArchiveText}
          loadingMoreText={loadingMoreText}
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

function NotificationList({
  query,
  notifications,
  hasNotifications,
  activeTab,
  wsId,
  noNotificationsText,
  emptyArchiveText,
  loadingMoreText,
  markAsReadText,
  markAsUnreadText,
  onMarkAsRead,
  queryClient,
  onActionComplete,
}: {
  query: ReturnType<typeof useInfiniteNotifications>;
  notifications: Notification[];
  hasNotifications: boolean;
  activeTab: TabType;
  wsId?: string;
  noNotificationsText: string;
  emptyArchiveText: string;
  loadingMoreText: string;
  markAsReadText: string;
  markAsUnreadText: string;
  onMarkAsRead: (id: string, isUnread: boolean) => void;
  queryClient: any;
  onActionComplete: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (
        entry?.isIntersecting &&
        query.hasNextPage &&
        !query.isFetchingNextPage
      ) {
        query.fetchNextPage();
      }
    },
    [query]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleIntersect, {
      root: scrollRef.current,
      rootMargin: '100px',
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleIntersect]);

  const emptyText =
    activeTab === 'inbox' ? noNotificationsText : emptyArchiveText;

  if (query.error) {
    return (
      <div className="flex h-90 flex-col items-center justify-center text-center">
        <Bell className="mb-3 h-10 w-10 text-dynamic-red/30" />
        <p className="text-foreground/60 text-sm">
          Failed to load notifications
        </p>
        <p className="mt-1 text-foreground/40 text-xs">
          {query.error instanceof Error ? query.error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-foreground/2 p-3">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 flex-none animate-pulse rounded-full bg-foreground/10" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-foreground/10" />
                <div className="h-4 w-full animate-pulse rounded bg-foreground/10" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-foreground/10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!hasNotifications) {
    return (
      <div className="flex h-90 flex-col items-center justify-center text-center">
        {activeTab === 'inbox' ? (
          <Inbox className="mb-3 h-10 w-10 text-foreground/20" />
        ) : (
          <Archive className="mb-3 h-10 w-10 text-foreground/20" />
        )}
        <p className="text-foreground/60 text-sm">{emptyText}</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="max-h-90 overflow-y-auto">
      <div className="space-y-1.5 p-2">
        {notifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            wsId={wsId}
            onMarkAsRead={onMarkAsRead}
            markAsReadText={markAsReadText}
            markAsUnreadText={markAsUnreadText}
            queryClient={queryClient}
            onActionComplete={onActionComplete}
          />
        ))}

        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="h-1" />

        {query.isFetchingNextPage && (
          <div className="flex items-center justify-center gap-2 py-3 text-foreground/40 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            {loadingMoreText}
          </div>
        )}
      </div>
    </div>
  );
}

interface NotificationCardProps {
  notification: Notification;
  wsId?: string;
  onMarkAsRead: (id: string, isUnread: boolean) => void;
  markAsReadText: string;
  markAsUnreadText: string;
  queryClient: any;
  onActionComplete?: () => void;
}

function NotificationCard({
  notification,
  wsId,
  onMarkAsRead,
  markAsReadText,
  markAsUnreadText,
  queryClient,
  onActionComplete,
}: NotificationCardProps) {
  const isUnread = !notification.read_at;
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const router = useRouter();

  const handleAction = async (actionType: string, payload: any) => {
    setProcessingAction(actionType);

    try {
      switch (actionType) {
        case 'WORKSPACE_INVITE_ACCEPT':
        case 'WORKSPACE_INVITE_DECLINE': {
          const accept = actionType === 'WORKSPACE_INVITE_ACCEPT';
          const targetWsId = payload.wsId;
          const url = `/api/workspaces/${targetWsId}/${
            accept ? 'accept-invite' : 'decline-invite'
          }`;

          const res = await fetch(url, { method: 'POST' });

          if (res.ok) {
            const updateRes = await fetch(
              `/api/v1/notifications/${notification.id}/metadata`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action_taken: accept ? 'accepted' : 'declined',
                  action_timestamp: new Date().toISOString(),
                }),
              }
            );

            if (updateRes.ok) {
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: ['workspaces'],
                  refetchType: 'active',
                }),
                queryClient.invalidateQueries({
                  queryKey: ['notifications'],
                  refetchType: 'active',
                }),
                queryClient.refetchQueries({
                  queryKey: ['notifications'],
                  type: 'active',
                }),
              ]);

              toast.success(
                accept
                  ? 'Workspace invite accepted'
                  : 'Workspace invite declined'
              );

              onMarkAsRead(notification.id, true);
              router.refresh();
              onActionComplete?.();
            } else {
              toast.error('Failed to update notification');
            }
          } else {
            const errorData = await res.json();
            console.error('Failed to process invite:', errorData);
            toast.error(errorData.error || 'Failed to process invite');
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      console.error('Action error:', error);
      toast.error('An error occurred');
    } finally {
      setProcessingAction(null);
    }
  };

  const notificationWsId = notification.ws_id || wsId;
  const entityLink =
    notification.entity_type === 'task' &&
    notification.entity_id &&
    notificationWsId
      ? `/${notificationWsId}/tasks/${notification.entity_id}`
      : null;

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-3 transition-all hover:border-foreground/20 hover:shadow-sm',
        isUnread
          ? 'border-dynamic-blue/40 bg-dynamic-blue/5'
          : 'bg-foreground/2 hover:bg-foreground/4'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            'flex h-8 w-8 flex-none items-center justify-center rounded-full transition-colors',
            isUnread
              ? 'bg-dynamic-blue/20 text-dynamic-blue'
              : 'bg-foreground/10 text-foreground/60'
          )}
        >
          {getNotificationIcon(notification.type)}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 font-medium text-sm leading-snug">
            {notification.title}
          </div>

          {notification.description && (
            <div className="mb-1.5 line-clamp-2 text-foreground/70 text-xs leading-relaxed">
              {notification.description}
            </div>
          )}

          <div className="mb-2 text-foreground/40 text-xs">
            {dayjs(notification.created_at).fromNow()}
          </div>

          {/* Action buttons or status */}
          {notification.type === 'workspace_invite' &&
          notification.data?.action_taken ? (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
              {notification.data.action_taken === 'accepted' ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-dynamic-green" />
                  <span className="font-medium text-dynamic-green">Joined</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 text-foreground/40" />
                  <span className="font-medium text-foreground/60">
                    Declined
                  </span>
                </>
              )}
            </div>
          ) : notification.type === 'workspace_invite' &&
            !notification.data?.action_taken ? (
            <div className="mt-2 flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleAction('WORKSPACE_INVITE_DECLINE', {
                    wsId: notification.data?.workspace_id,
                  })
                }
                disabled={!!processingAction}
                className="h-7 gap-1 text-xs"
              >
                {processingAction === 'WORKSPACE_INVITE_DECLINE' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                Decline
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  handleAction('WORKSPACE_INVITE_ACCEPT', {
                    wsId: notification.data?.workspace_id,
                  })
                }
                disabled={!!processingAction}
                className="h-7 gap-1 text-xs"
              >
                {processingAction === 'WORKSPACE_INVITE_ACCEPT' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                Accept
              </Button>
            </div>
          ) : entityLink ? (
            <Link href={entityLink} onClick={onActionComplete}>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs hover:text-dynamic-blue"
              >
                View details →
              </Button>
            </Link>
          ) : null}
        </div>

        {/* Mark as read/unread button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7 flex-none transition-opacity hover:bg-foreground/10',
            'opacity-0 group-hover:opacity-100'
          )}
          onClick={() => onMarkAsRead(notification.id, isUnread)}
          title={isUnread ? markAsReadText : markAsUnreadText}
        >
          {isUnread ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

function getNotificationIcon(type: string) {
  const iconClassName = 'h-4 w-4';

  switch (type) {
    case 'task_assigned':
      return <ClipboardList className={iconClassName} />;
    case 'task_updated':
      return <Edit3 className={iconClassName} />;
    case 'task_completed':
      return <CheckCircle2 className={iconClassName} />;
    case 'task_reopened':
      return <RotateCcw className={iconClassName} />;
    case 'task_mention':
      return <AtSign className={iconClassName} />;
    case 'task_due_date_changed':
    case 'task_start_date_changed':
      return <Calendar className={iconClassName} />;
    case 'workspace_invite':
      return <Mail className={iconClassName} />;
    case 'account_update':
      return <UserPlus className={iconClassName} />;
    case 'security_alert':
      return <Shield className={iconClassName} />;
    default:
      return <Bell className={iconClassName} />;
  }
}
