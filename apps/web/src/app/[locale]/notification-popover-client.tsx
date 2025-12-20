'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
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
  Loader2,
  Mail,
  RotateCcw,
  Shield,
  UserPlus,
  X,
  XCircle,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  type Notification,
  useNotificationSubscription,
  useNotifications,
  useUpdateNotification,
} from '@/hooks/useNotifications';

dayjs.extend(relativeTime);

interface NotificationPopoverClientProps {
  userId?: string;
  noNotificationsText: string;
  notificationsText: string;
  viewAllText: string;
  markAsReadText: string;
  markAsUnreadText: string;
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
}: NotificationPopoverClientProps) {
  const [open, setOpen] = useState(false);
  const params = useParams();
  const queryClient = useQueryClient();

  // Only use wsId if it's a valid UUID (to filter out 'internal', 'personal', etc.)
  // If not a UUID, we'll fetch all notifications across workspaces
  const wsId = isValidUUID(params.wsId) ? params.wsId : undefined;

  // Fetch notifications - limit to 5 most recent
  // If wsId exists and is valid UUID, fetch workspace-specific notifications
  // Otherwise, fetch all notifications for the user
  const { data, isLoading, error } = useNotifications({
    wsId,
    limit: 5,
    offset: 0,
    unreadOnly: false,
  });

  const updateNotification = useUpdateNotification();

  // Subscribe to realtime updates for all user's notifications
  useNotificationSubscription(wsId || '', userId || '');

  const notifications = data?.notifications || [];
  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const hasNotifications = notifications.length > 0;

  // Use the raw wsId from params for URL construction (could be 'internal', 'personal', or UUID)
  const notificationsPageUrl = params.wsId
    ? `/${params.wsId}/notifications`
    : '/notifications';

  const handleMarkAsRead = async (id: string, isUnread: boolean) => {
    try {
      await updateNotification.mutateAsync({ id, read: isUnread });
      // Optimistic update is handled by the useUpdateNotification hook
    } catch (error) {
      console.error('Failed to update notification:', error);
      toast.error('Failed to update notification');
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
                {unreadCount}
              </div>
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 overflow-hidden rounded-xl border p-0 shadow-xl"
        align="end"
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between border-b bg-background px-4 py-3">
          <h3 className="font-semibold text-base">{notificationsText}</h3>
          {unreadCount > 0 && (
            <span className="rounded-full bg-dynamic-red/10 px-2.5 py-0.5 font-medium text-dynamic-red text-xs">
              {unreadCount} new
            </span>
          )}
        </div>

        {/* Scrollable Notifications List */}
        <ScrollArea className="h-[400px]">
          {error ? (
            <div className="flex h-[400px] flex-col items-center justify-center text-center">
              <Bell className="mb-3 h-12 w-12 text-dynamic-red/30" />
              <p className="text-foreground/60 text-sm">
                Failed to load notifications
              </p>
              <p className="mt-1 text-foreground/40 text-xs">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          ) : isLoading ? (
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
          ) : hasNotifications ? (
            <div className="space-y-1.5 p-2">
              {notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  wsId={wsId}
                  rawWsId={params.wsId as string}
                  onMarkAsRead={handleMarkAsRead}
                  markAsReadText={markAsReadText}
                  markAsUnreadText={markAsUnreadText}
                  queryClient={queryClient}
                  onActionComplete={() => {
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-[400px] flex-col items-center justify-center text-center">
              <Bell className="mb-3 h-12 w-12 text-foreground/20" />
              <p className="text-foreground/60 text-sm">
                {noNotificationsText}
              </p>
            </div>
          )}
        </ScrollArea>

        {/* Fixed Footer with View All button */}
        <div className="border-t bg-background">
          <Link
            href={notificationsPageUrl}
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 px-4 py-3 font-medium text-sm transition-colors hover:rounded-b-xl hover:bg-foreground/5"
          >
            {viewAllText}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface NotificationCardProps {
  notification: Notification;
  wsId?: string; // Resolved UUID for API calls
  rawWsId?: string; // Raw param for URL construction
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
            // Update notification metadata
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
              // Invalidate and refetch queries to ensure both popover and page are in sync
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

              // Mark as read after successful action
              onMarkAsRead(notification.id, true);

              // Refresh router to update workspace list in sidebar
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

  // Build link to entity using the notification's workspace ID or fallback to current workspace
  // For task notifications, use the ws_id from the notification itself
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
          {/* Title */}
          <div className="mb-1 font-medium text-sm leading-snug">
            {notification.title}
          </div>

          {/* Description */}
          {notification.description && (
            <div className="mb-1.5 text-foreground/70 text-xs leading-relaxed">
              {notification.description}
            </div>
          )}

          {/* Timestamp */}
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

        {/* Mark as read button */}
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
