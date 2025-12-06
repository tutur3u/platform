'use client';

import {
  type Notification,
  type NotificationType,
  useMarkAllAsRead,
  useNotificationSubscription,
  useNotifications,
  useUpdateNotification,
} from '@/hooks/useNotifications';
import { DescriptionDiffViewer } from '@/components/tasks/description-diff-viewer';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AtSign,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Link2,
  Loader2,
  Mail,
  MoveRight,
  RotateCcw,
  Shield,
  Tag,
  UserMinus,
  UserPlus,
  X,
  XCircle,
} from '@tuturuuu/icons';
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
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

dayjs.extend(relativeTime);

interface NotificationListProps {
  wsId: string | null;
  userId: string;
  currentWsId?: string; // Current workspace for building links
}

export default function NotificationList({
  wsId,
  userId,
  currentWsId,
}: NotificationListProps) {
  const t = useTranslations('notifications');
  const queryClient = useQueryClient();
  const [selectedTypes, setSelectedTypes] = useState<NotificationType[]>([]);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Fetch notifications (wsId=null means show all notifications across workspaces)
  const { data, isLoading } = useNotifications({
    wsId: wsId || undefined,
    limit: pageSize,
    offset: page * pageSize,
    unreadOnly: showUnreadOnly,
    type: selectedTypes.length === 1 ? selectedTypes[0] : undefined,
  });

  // Mutations
  const updateNotification = useUpdateNotification();
  const markAllAsRead = useMarkAllAsRead();

  // Subscribe to realtime updates (use currentWsId or null)
  useNotificationSubscription(currentWsId || null, userId);

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

  // Group notifications by entity and time window (5 minutes)
  const groupedNotifications = React.useMemo(() => {
    const groups: Array<{
      key: string;
      notifications: Notification[];
      entityId: string | null;
      entityType: string | null;
    }> = [];

    const TIME_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

    for (const notification of notifications) {
      // Only group task-related notifications
      if (
        !notification.entity_type ||
        notification.entity_type !== 'task' ||
        !notification.entity_id
      ) {
        // Add as individual notification
        groups.push({
          key: notification.id,
          notifications: [notification],
          entityId: null,
          entityType: null,
        });
        continue;
      }

      // Find existing group for this entity within time window
      const existingGroup = groups.find(
        (g) =>
          g.entityId === notification.entity_id &&
          g.entityType === notification.entity_type &&
          g.notifications.length > 0 &&
          Math.abs(
            new Date(g.notifications[0]!.created_at).getTime() -
              new Date(notification.created_at).getTime()
          ) < TIME_WINDOW_MS
      );

      if (existingGroup) {
        existingGroup.notifications.push(notification);
      } else {
        groups.push({
          key: `${notification.entity_type}-${notification.entity_id}-${notification.id}`,
          notifications: [notification],
          entityId: notification.entity_id,
          entityType: notification.entity_type,
        });
      }
    }

    return groups;
  }, [notifications]);

  const allTypes: NotificationType[] = [
    'task_assigned',
    'task_updated',
    'task_completed',
    'task_reopened',
    'task_priority_changed',
    'task_due_date_changed',
    'task_start_date_changed',
    'task_estimation_changed',
    'task_moved',
    'task_mention',
    'task_title_changed',
    'task_description_changed',
    'task_label_added',
    'task_label_removed',
    'task_project_linked',
    'task_project_unlinked',
    'task_assignee_removed',
    'workspace_invite',
    'system_announcement',
    'account_update',
    'security_alert',
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
                  <span className="mr-2 text-foreground/60">
                    {getNotificationIcon(type)}
                  </span>
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
            className="gap-1.5"
          >
            <Bell className="h-4 w-4" />
            {t('unread-only')}
          </Button>

          {/* Mark all as read */}
          {notifications.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsRead.isPending}
            >
              {markAllAsRead.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {t('mark-all-read')}
            </Button>
          )}
        </div>
      </div>

      {/* Notifications list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 flex-none animate-pulse rounded-full bg-foreground/10" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-32 animate-pulse rounded bg-foreground/10" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-foreground/10" />
                  <div className="h-3 w-full animate-pulse rounded bg-foreground/10" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5">
              <Bell className="h-8 w-8 text-foreground/30" />
            </div>
            <h3 className="mb-2 font-semibold text-lg">
              {t('no-notifications')}
            </h3>
            <p className="max-w-sm text-foreground/60 text-sm">
              {showUnreadOnly || selectedTypes.length > 0
                ? 'No notifications match your filters. Try adjusting your filters to see more results.'
                : 'You will be notified here when something happens in your workspace.'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {groupedNotifications.map((group) =>
            group.notifications.length > 1 ? (
              <GroupedNotificationCard
                key={group.key}
                notifications={group.notifications}
                onMarkAsRead={handleMarkAsRead}
                t={t}
                wsId={currentWsId || wsId || ''}
                updateNotification={updateNotification}
                queryClient={queryClient}
              />
            ) : group.notifications[0] ? (
              <NotificationCard
                key={group.notifications[0]?.id}
                notification={group.notifications[0]}
                onMarkAsRead={handleMarkAsRead}
                t={t}
                wsId={currentWsId || wsId || ''}
                isUpdating={
                  updateNotification.isPending &&
                  updateNotification.variables?.id ===
                    group.notifications[0]?.id
                }
                onActionComplete={() => {
                  // Refresh notifications after action
                  queryClient.invalidateQueries({
                    queryKey: ['notifications'],
                  });
                }}
              />
            ) : null
          )}
        </div>
      )}

      {/* Pagination */}
      {(hasMore || hasPrevious) && (
        <div className="flex items-center justify-between rounded-lg border bg-card p-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={!hasPrevious}
            className="gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="font-medium text-foreground/80 text-sm">
            Page {page + 1} of {Math.ceil(totalCount / pageSize)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="gap-1.5"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

interface NotificationCardProps {
  notification: Notification;
  onMarkAsRead: (id: string, isUnread: boolean) => void;
  t: any;
  wsId: string;
  isUpdating: boolean;
  onActionComplete?: () => void;
}

function NotificationCard({
  notification,
  onMarkAsRead,
  t,
  wsId,
  isUpdating,
  onActionComplete,
}: NotificationCardProps) {
  const isUnread = !notification.read_at;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  // Build link to entity
  const entityLink = getEntityLink(notification, wsId);

  // Get actions for this notification
  const actions = getNotificationActions(notification, t);

  const handleAction = async (actionType: string, payload: any) => {
    setIsProcessing(true);

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
            // Update notification metadata to reflect action taken
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
              // Invalidate and refetch immediately
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

              router.refresh();
              onActionComplete?.();

              // Mark notification as read after action
              onMarkAsRead(notification.id, true);
            } else {
              toast.error('Failed to update notification');
            }
          } else {
            toast.error('Failed to process invite');
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
      setIsProcessing(false);
    }
  };

  return (
    <Card
      className={`group relative p-4 transition-all duration-200 hover:shadow-lg ${
        isUnread
          ? 'border-dynamic-blue/40 bg-dynamic-blue/5 hover:border-dynamic-blue/60'
          : 'hover:border-foreground/20'
      } ${isUpdating ? 'pointer-events-none opacity-70' : ''}`}
    >
      {isUpdating && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/20 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-md bg-background px-3 py-1.5 text-sm shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin text-dynamic-blue" />
            <span className="font-medium text-foreground">{t('updating')}</span>
          </div>
        </div>
      )}
      <div className="flex items-start gap-4">
        {/* Type icon */}
        <div
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-full transition-colors ${
            isUnread
              ? 'bg-dynamic-blue/20 text-dynamic-blue'
              : 'bg-foreground/10 text-foreground/60'
          }`}
        >
          {getNotificationIcon(notification.type)}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Type badge, workspace, and timestamp */}
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-foreground/60 uppercase tracking-wide">
              {t(`types.${notification.type}`)}
            </span>
            {notification.data?.workspace_name && (
              <>
                <span className="text-foreground/40">•</span>
                <span className="rounded bg-foreground/10 px-1.5 py-0.5 font-medium text-foreground/70">
                  {notification.data.workspace_name}
                </span>
              </>
            )}
            <span className="text-foreground/40">•</span>
            <span className="text-foreground/60">
              {dayjs(notification.created_at).fromNow()}
            </span>
          </div>

          {/* Title */}
          <h3 className="mb-1 font-semibold text-base text-foreground/90 leading-tight group-hover:text-foreground">
            {notification.title}
          </h3>

          {/* Description */}
          {notification.description && (
            <p className="mb-2 text-foreground/70 text-sm leading-relaxed">
              {notification.description}
            </p>
          )}

          {/* Change details - show before/after states */}
          {notification.data?.changes && (
            <ChangeDetails changes={notification.data.changes} t={t} />
          )}

          {/* Single field change (for older notifications or simple changes) */}
          {notification.data?.change_type && !notification.data?.changes && (
            <SingleChangeDetail
              changeType={notification.data.change_type}
              oldValue={notification.data.old_value}
              newValue={notification.data.new_value}
              t={t}
            />
          )}

          {/* Action buttons or status */}
          {notification.type === 'workspace_invite' &&
          notification.data?.action_taken ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              {notification.data.action_taken === 'accepted' ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                  <span className="font-medium text-dynamic-green">
                    {t('workspace-invite-accepted') || 'Joined workspace'}
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-foreground/40" />
                  <span className="font-medium text-foreground/60">
                    {t('workspace-invite-declined') || 'Invite declined'}
                  </span>
                </>
              )}
            </div>
          ) : actions.length > 0 ? (
            <div className="mt-3 flex items-center gap-2">
              {actions.map((action) => (
                <Button
                  key={action.id}
                  variant={action.variant as any}
                  size="sm"
                  onClick={() => handleAction(action.type, action.payload)}
                  disabled={isProcessing}
                  className="gap-1.5"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    action.icon
                  )}
                  {action.label}
                </Button>
              ))}
            </div>
          ) : entityLink ? (
            <Link href={entityLink} className="mt-3 block">
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

        {/* Actions */}
        <div
          className={`flex flex-none items-center transition-opacity ${
            isUpdating ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-foreground/10"
            onClick={() => onMarkAsRead(notification.id, isUnread)}
            disabled={isUpdating}
            title={isUnread ? t('mark-as-read') : t('mark-as-unread')}
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isUnread ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface GroupedNotificationCardProps {
  notifications: Notification[];
  onMarkAsRead: (id: string, isUnread: boolean) => void;
  t: any;
  wsId: string;
  updateNotification: any;
  queryClient: any;
}

function GroupedNotificationCard({
  notifications,
  onMarkAsRead,
  t,
  wsId,
  updateNotification,
  queryClient,
}: GroupedNotificationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasUnread = notifications.some((n) => !n.read_at);

  // Get the first notification for summary
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
    .map(([type, count]) => {
      const typeKey = `types.${type}` as any;
      const typeLabel = t(typeKey);
      return count > 1 ? `${count} ${typeLabel}` : typeLabel;
    })
    .join(', ');

  // Find description changes in the group for showing diff viewers
  const descriptionChanges = notifications
    .map((n) => {
      // Check for changes object with description field
      if (n.data?.changes?.description) {
        return {
          id: n.id,
          oldValue: n.data.changes.description.old,
          newValue: n.data.changes.description.new,
        };
      }
      // Check for task_description_changed type
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

  const handleMarkAllAsRead = async () => {
    // Get all unread notification IDs
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);

    if (unreadIds.length === 0) return;

    // Mark all as read sequentially to avoid race conditions
    for (const id of unreadIds) {
      try {
        await updateNotification.mutateAsync({ id, read: true });
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
      }
    }

    // Force a refetch to ensure UI is in sync
    await queryClient.invalidateQueries({
      queryKey: ['notifications'],
      refetchType: 'active',
    });
  };

  return (
    <Card
      className={`group relative overflow-hidden transition-all ${
        hasUnread
          ? 'border-l-4 border-l-dynamic-blue bg-dynamic-blue/5'
          : 'hover:bg-foreground/5'
      }`}
    >
      <div className="flex items-start gap-4 p-4">
        {/* Icon */}
        <div
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${
            hasUnread
              ? 'bg-dynamic-blue/15 text-dynamic-blue'
              : 'bg-foreground/10 text-foreground/60'
          }`}
        >
          {getNotificationIcon(firstNotification?.type || 'task_updated')}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Summary header */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="mb-1 font-medium text-foreground text-sm">
                  {notifications.length} updates to "{taskName}"
                </h3>
                <p className="text-foreground/60 text-xs">{summaryText}</p>
                <p className="mt-1 text-foreground/40 text-xs">
                  {dayjs(firstNotification?.created_at).fromNow()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {hasUnread && (
                  <span className="flex h-2 w-2 flex-none rounded-full bg-dynamic-blue" />
                )}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-foreground/40" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-foreground/40" />
                )}
              </div>
            </div>
          </button>

          {/* Show diff viewers for description changes in the group - outside button to avoid nesting */}
          {descriptionChanges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {descriptionChanges.map((change, index) => (
                <DescriptionDiffViewer
                  key={change.id}
                  oldValue={change.oldValue}
                  newValue={change.newValue}
                  t={t}
                  triggerVariant="inline"
                  trigger={
                    descriptionChanges.length > 1 ? (
                      <span className="inline-flex cursor-pointer items-center gap-1 text-xs text-dynamic-blue hover:underline">
                        <Eye className="h-3 w-3" />
                        {t('view_changes', {
                          defaultValue: 'View changes',
                        })}{' '}
                        #{index + 1}
                      </span>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}

          {/* Expanded notifications */}
          {isExpanded && (
            <div className="mt-4 space-y-2 border-t pt-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="flex items-start gap-3 rounded-lg bg-foreground/5 p-3"
                >
                  <div className="flex-1">
                    <p className="mb-1 font-medium text-sm">
                      {notification.title}
                    </p>
                    {notification.description && (
                      <p className="mb-1 text-foreground/60 text-xs">
                        {notification.description}
                      </p>
                    )}
                    {/* Show change details in grouped view */}
                    {notification.data?.changes && (
                      <div className="mt-1.5">
                        <ChangeDetails
                          changes={notification.data.changes}
                          t={t}
                        />
                      </div>
                    )}
                    {notification.data?.change_type &&
                      !notification.data?.changes && (
                        <div className="mt-1.5">
                          <SingleChangeDetail
                            changeType={notification.data.change_type}
                            oldValue={notification.data.old_value}
                            newValue={notification.data.new_value}
                            t={t}
                          />
                        </div>
                      )}
                    <p className="mt-1 text-foreground/40 text-xs">
                      {dayjs(notification.created_at).fromNow()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() =>
                        onMarkAsRead(notification.id, !notification.read_at)
                      }
                      title={
                        notification.read_at
                          ? t('mark-as-unread')
                          : t('mark-as-read')
                      }
                    >
                      {notification.read_at ? (
                        <Eye className="h-3 w-3" />
                      ) : (
                        <EyeOff className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* View task link */}
          {entityLink && (
            <Link href={entityLink} className="mt-3 block">
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs hover:text-dynamic-blue"
              >
                View task →
              </Button>
            </Link>
          )}
        </div>

        {/* Group actions */}
        {hasUnread && (
          <div
            className={`flex flex-none transition-opacity ${
              updateNotification.isPending
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-foreground/10"
              onClick={handleMarkAllAsRead}
              title={t('mark-all-read')}
            >
              <EyeOff className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function getNotificationIcon(type: string) {
  const iconClassName = 'h-5 w-5';

  switch (type) {
    case 'task_assigned':
      return <ClipboardList className={iconClassName} />;
    case 'task_updated':
      return <Edit3 className={iconClassName} />;
    case 'task_completed':
      return <CheckCircle2 className={iconClassName} />;
    case 'task_reopened':
      return <RotateCcw className={iconClassName} />;
    case 'task_priority_changed':
      return <AlertCircle className={iconClassName} />;
    case 'task_due_date_changed':
      return <Calendar className={iconClassName} />;
    case 'task_start_date_changed':
      return <Calendar className={iconClassName} />;
    case 'task_estimation_changed':
      return <Clock className={iconClassName} />;
    case 'task_moved':
      return <MoveRight className={iconClassName} />;
    case 'task_mention':
      return <AtSign className={iconClassName} />;
    case 'task_title_changed':
      return <FileText className={iconClassName} />;
    case 'task_description_changed':
      return <FileText className={iconClassName} />;
    case 'task_label_added':
      return <Tag className={iconClassName} />;
    case 'task_label_removed':
      return <Tag className={iconClassName} />;
    case 'task_project_linked':
      return <Link2 className={iconClassName} />;
    case 'task_project_unlinked':
      return <Link2 className={iconClassName} />;
    case 'task_assignee_removed':
      return <UserMinus className={iconClassName} />;
    case 'workspace_invite':
      return <Mail className={iconClassName} />;
    case 'system_announcement':
      return <Bell className={iconClassName} />;
    case 'account_update':
      return <UserPlus className={iconClassName} />;
    case 'security_alert':
      return <Shield className={iconClassName} />;
    default:
      return <Bell className={iconClassName} />;
  }
}

function getEntityLink(
  notification: Notification,
  currentWsId: string
): string | null {
  const { entity_type, entity_id, data, ws_id } = notification;

  // Use the notification's workspace ID if available, otherwise use current workspace
  const targetWsId = ws_id || currentWsId;

  if (entity_type === 'task' && entity_id) {
    const boardId = data?.board_id;
    return boardId
      ? `/${targetWsId}/tasks/${entity_id}`
      : `/${targetWsId}/tasks/${entity_id}`;
  }

  if (entity_type === 'workspace' && entity_id) {
    return `/${entity_id}`;
  }

  return null;
}

interface NotificationAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
  type: string;
  payload: any;
}

function getNotificationActions(
  notification: Notification,
  t: any
): NotificationAction[] {
  const { type, data } = notification;

  switch (type) {
    case 'workspace_invite': {
      // Don't show actions if already processed
      if (data?.action_taken) return [];

      const workspaceId = data?.workspace_id;
      if (!workspaceId) return [];

      return [
        {
          id: `decline-${notification.id}`,
          label: t('decline'),
          icon: <X className="h-4 w-4" />,
          variant: 'outline',
          type: 'WORKSPACE_INVITE_DECLINE',
          payload: { wsId: workspaceId },
        },
        {
          id: `accept-${notification.id}`,
          label: t('accept'),
          icon: <Check className="h-4 w-4" />,
          variant: 'default',
          type: 'WORKSPACE_INVITE_ACCEPT',
          payload: { wsId: workspaceId },
        },
      ];
    }
    default:
      return [];
  }
}

function ChangeDetails({
  changes,
  t,
}: {
  changes: any;
  t?: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const changeEntries = Object.entries(changes);

  if (changeEntries.length === 0) return null;

  // Default translation function
  const translate =
    t ||
    ((key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue || key);

  return (
    <div className="mt-2 space-y-1.5 rounded-lg border bg-foreground/5 p-3">
      {changeEntries.map(([field, change]: [string, any]) => {
        const oldValue = change.old;
        const newValue = change.new;
        const isDescriptionChange = field === 'description';

        return (
          <div key={field} className="text-xs">
            <span className="font-medium text-foreground/70">
              {formatFieldName(field)}:
            </span>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="rounded bg-red-500/10 px-2 py-0.5 font-mono text-red-600 dark:text-red-400">
                {formatValue(oldValue, field)}
              </span>
              <span className="text-foreground/40">→</span>
              <span className="rounded bg-green-500/10 px-2 py-0.5 font-mono text-green-600 dark:text-green-400">
                {formatValue(newValue, field)}
              </span>
              {isDescriptionChange && (oldValue || newValue) && (
                <DescriptionDiffViewer
                  oldValue={oldValue}
                  newValue={newValue}
                  t={translate}
                  triggerVariant="inline"
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Helper component for single change details
function SingleChangeDetail({
  changeType,
  oldValue,
  newValue,
  t,
}: {
  changeType: string;
  oldValue?: any;
  newValue?: any;
  t: any;
}) {
  const field = changeType.replace('task_', '').replace('_changed', '');

  if (!oldValue && !newValue) return null;

  // For description changes, show a diff viewer button
  const isDescriptionChange =
    field === 'description' || changeType === 'task_description_changed';

  return (
    <div className="mt-2 rounded-lg border bg-foreground/5 p-3">
      <div className="text-xs">
        <span className="font-medium text-foreground/70">
          {formatFieldName(field)}:
        </span>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {oldValue && (
            <span className="rounded bg-red-500/10 px-2 py-0.5 font-mono text-red-600 dark:text-red-400">
              {formatValue(oldValue, field)}
            </span>
          )}
          {oldValue && newValue && (
            <span className="text-foreground/40">→</span>
          )}
          {newValue && (
            <span className="rounded bg-green-500/10 px-2 py-0.5 font-mono text-green-600 dark:text-green-400">
              {formatValue(newValue, field)}
            </span>
          )}
          {isDescriptionChange && (oldValue || newValue) && (
            <DescriptionDiffViewer
              oldValue={oldValue}
              newValue={newValue}
              t={t}
              triggerVariant="inline"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function to format field names
function formatFieldName(field: string): string {
  const fieldMap: Record<string, string> = {
    name: 'Title',
    description: 'Description',
    priority: 'Priority',
    due_date: 'Due Date',
    start_date: 'Start Date',
    estimation: 'Estimation',
    completed: 'Status',
    label_name: 'Label',
  };

  return (
    fieldMap[field] ||
    field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

// Helper function to format values for display
function formatValue(value: any, field: string): string {
  // Handle null/undefined
  if (value === null || value === undefined) return 'Not set';

  // Handle boolean values
  if (typeof value === 'boolean') return value ? 'Completed' : 'Not completed';

  // Handle priority values
  if (field === 'priority') {
    const priorityMap: Record<string, string> = {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      urgent: 'Urgent',
    };
    return (
      priorityMap[String(value).toLowerCase()] || capitalizeFirst(String(value))
    );
  }

  // Handle date fields - check if it's a valid ISO date string
  if (field === 'due_date' || field === 'end_date' || field === 'start_date') {
    if (typeof value === 'string' && value.includes('T')) {
      const date = dayjs(value);
      if (date.isValid()) {
        return date.format('MMM D, YYYY');
      }
    }
    return capitalizeFirst(String(value));
  }

  // Handle estimation (estimation_points)
  if (field === 'estimation' || field === 'estimation_points') {
    const num = Number(value);
    if (!Number.isNaN(num)) {
      return `${num} hour${num !== 1 ? 's' : ''}`;
    }
    return String(value);
  }

  // Handle description fields - extract text from TipTap JSON
  if (field === 'description') {
    const descriptionText = getDescriptionText(value);
    // Truncate long descriptions
    if (descriptionText.length > 50) {
      return `${descriptionText.substring(0, 50)}...`;
    }
    return descriptionText || 'Not set';
  }

  // Handle long strings
  if (typeof value === 'string' && value.length > 50) {
    return `${value.substring(0, 50)}...`;
  }

  // Handle all other strings - capitalize first letter
  if (typeof value === 'string') {
    return capitalizeFirst(value);
  }

  return String(value);
}

// Helper function to capitalize first letter of a string
function capitalizeFirst(str: string): string {
  if (!str || typeof str !== 'string') return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
