'use client';

import {
  AtSign,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
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
import { updateNotificationMetadata } from '@tuturuuu/internal-api';
import {
  acceptWorkspaceInvite,
  declineWorkspaceInvite,
} from '@tuturuuu/internal-api/workspaces';
import { Button } from '@tuturuuu/ui/button';
import type { Notification } from '@tuturuuu/ui/hooks/use-notifications';
import {
  dispatchRequestOpenTask,
  waitForTaskOpenResult,
} from '@tuturuuu/ui/lib/task-open-events';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState } from 'react';

import { useNotificationRuntime } from './notification-runtime';

dayjs.extend(relativeTime);
interface NotificationCardProps {
  notification: Notification;
  wsId?: string;
  onMarkAsRead: (id: string, isUnread: boolean) => void;
  markAsReadText: string;
  markAsUnreadText: string;
  queryClient: any;
  onActionComplete?: () => void;
  acceptText: string;
  declineText: string;
  acceptedText: string;
  declinedText: string;
}

function getWorkspaceInviteWorkspaceId(notification: Notification) {
  const candidates = [
    notification.data?.workspace_id,
    notification.entity_id,
    notification.ws_id,
  ];

  return (
    candidates.find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.length > 0
    ) ?? null
  );
}

export function NotificationCard({
  notification,
  wsId,
  onMarkAsRead,
  markAsReadText,
  markAsUnreadText,
  queryClient,
  onActionComplete,
  acceptText,
  declineText,
  acceptedText,
  declinedText,
}: NotificationCardProps) {
  const isUnread = !notification.read_at;
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const { router, params, pathname, Link } = useNotificationRuntime();

  const handleAction = async (actionType: string, payload: any) => {
    setProcessingAction(actionType);

    try {
      switch (actionType) {
        case 'WORKSPACE_INVITE_ACCEPT':
        case 'WORKSPACE_INVITE_DECLINE': {
          const accept = actionType === 'WORKSPACE_INVITE_ACCEPT';
          const targetWsId = payload.wsId;
          if (!targetWsId) {
            toast.error('Failed to process invite');
            break;
          }

          await (accept
            ? acceptWorkspaceInvite(targetWsId)
            : declineWorkspaceInvite(targetWsId));
          await updateNotificationMetadata(notification.id, {
            action_taken: accept ? 'accepted' : 'declined',
            action_timestamp: new Date().toISOString(),
          });

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

          toast.success(accept ? acceptedText : declinedText);

          onMarkAsRead(notification.id, true);
          router.refresh();
          onActionComplete?.();
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
  const isTaskEntityNotification =
    notification.entity_type === 'task' && !!notification.entity_id;
  const entityLink =
    notification.entity_type === 'time_tracking_request' &&
    notification.entity_id &&
    notificationWsId
      ? `/${notificationWsId}/time-tracker/requests`
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
                  <span className="font-medium text-dynamic-green">
                    {acceptedText}
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 text-foreground/40" />
                  <span className="font-medium text-foreground/60">
                    {declinedText}
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
                    wsId: getWorkspaceInviteWorkspaceId(notification),
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
                {declineText}
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  handleAction('WORKSPACE_INVITE_ACCEPT', {
                    wsId: getWorkspaceInviteWorkspaceId(notification),
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
                {acceptText}
              </Button>
            </div>
          ) : isTaskEntityNotification ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs hover:text-dynamic-blue"
              disabled={!!processingAction}
              onClick={async () => {
                if (!notification.entity_id) return;
                setProcessingAction('OPEN_TASK');
                try {
                  const { handled, requestId } = dispatchRequestOpenTask({
                    taskId: notification.entity_id,
                    wsId: notificationWsId,
                  });

                  const opened = handled
                    ? await waitForTaskOpenResult(requestId, 6000)
                    : false;

                  if (!opened && notificationWsId) {
                    const locale =
                      typeof params?.locale === 'string' ? params.locale : null;
                    const targetWorkspacePath = locale
                      ? `/${locale}/${notificationWsId}`
                      : `/${notificationWsId}`;
                    const isAlreadyInTargetWorkspace =
                      pathname === targetWorkspacePath ||
                      pathname.startsWith(`${targetWorkspacePath}/`);

                    const openTaskParam = `openTaskId=${encodeURIComponent(notification.entity_id)}`;
                    const fallbackUrl = isAlreadyInTargetWorkspace
                      ? `${pathname}?${openTaskParam}`
                      : `${targetWorkspacePath}?${openTaskParam}`;

                    router.push(fallbackUrl);
                  }
                  onActionComplete?.();
                } finally {
                  setProcessingAction(null);
                }
              }}
            >
              {processingAction === 'OPEN_TASK' ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Opening...
                </>
              ) : (
                'View details →'
              )}
            </Button>
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
