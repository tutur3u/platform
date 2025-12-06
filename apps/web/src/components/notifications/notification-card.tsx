'use client';

import type { Notification } from '@/hooks/useNotifications';
import { DescriptionDiffViewer } from '@/components/tasks/description-diff-viewer';
import {
  formatFieldName,
  formatValue,
  getEntityLink,
  type TranslationFn,
} from './notification-utils';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  User,
  X,
  XCircle,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

dayjs.extend(relativeTime);

interface NotificationCardProps {
  notification: Notification;
  onMarkAsRead: (id: string, isUnread: boolean) => void;
  t: TranslationFn;
  wsId: string;
  isUpdating: boolean;
  onActionComplete?: () => void;
  index?: number;
}

export function NotificationCard({
  notification,
  onMarkAsRead,
  t,
  wsId,
  isUpdating,
  onActionComplete,
  index = 0,
}: NotificationCardProps) {
  const isUnread = !notification.read_at;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  const entityLink = getEntityLink(notification, wsId);
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
              ]);

              toast.success(
                accept
                  ? t('workspace-invite-accepted')
                  : t('workspace-invite-declined')
              );

              router.refresh();
              onActionComplete?.();
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.05,
        ease: [0.23, 1, 0.32, 1],
      }}
      className={cn(
        'group relative rounded-xl border transition-all duration-200',
        'hover:shadow-sm',
        isUnread
          ? 'border-dynamic-blue/20 bg-dynamic-blue/[0.03]'
          : 'border-foreground/5 bg-foreground/[0.01] hover:border-foreground/10 hover:bg-foreground/[0.02]',
        isUpdating && 'pointer-events-none opacity-60'
      )}
    >
      {/* Unread indicator line */}
      {isUnread && (
        <div className="absolute top-4 bottom-4 left-0 w-0.5 rounded-full bg-dynamic-blue" />
      )}

      <div className="flex items-start gap-3 p-4">
        {/* Actor avatar with type icon badge */}
        <div className="relative flex-none">
          <Avatar
            className={cn(
              'h-10 w-10 ring-2 transition-colors',
              isUnread ? 'ring-dynamic-blue/20' : 'ring-foreground/5'
            )}
          >
            {notification.actor?.avatar_url ? (
              <AvatarImage
                src={notification.actor.avatar_url}
                alt={notification.actor.display_name || 'User'}
              />
            ) : null}
            <AvatarFallback
              className={cn(
                'text-xs font-medium',
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
                <User className="h-4 w-4" />
              )}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Meta row */}
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span
              className={cn(
                'font-medium',
                isUnread ? 'text-dynamic-blue' : 'text-foreground/50'
              )}
            >
              {t(`types.${notification.type}`)}
            </span>

            {notification.data?.workspace_name && (
              <>
                <span className="text-foreground/20">·</span>
                <span className="text-foreground/50">
                  {notification.data.workspace_name}
                </span>
              </>
            )}

            <span className="text-foreground/20">·</span>
            <span className="text-foreground/40">
              {dayjs(notification.created_at).fromNow()}
            </span>
          </div>

          {/* Title */}
          <h3
            className={cn(
              'mb-1 font-medium text-sm leading-snug',
              isUnread ? 'text-foreground' : 'text-foreground/80'
            )}
          >
            {notification.title}
          </h3>

          {/* Description */}
          {notification.description && (
            <p className="mb-2 text-foreground/60 text-sm leading-relaxed">
              {notification.description}
            </p>
          )}

          {/* Change details */}
          {notification.data?.changes && (
            <ChangeDetails changes={notification.data.changes} t={t} />
          )}

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
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-1.5 text-sm">
              {notification.data.action_taken === 'accepted' ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-dynamic-green" />
                  <span className="font-medium text-dynamic-green text-xs">
                    {t('workspace-invite-accepted')}
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 text-foreground/40" />
                  <span className="font-medium text-foreground/50 text-xs">
                    {t('workspace-invite-declined')}
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
                  className="h-8 gap-1.5 text-xs"
                >
                  {isProcessing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    action.icon
                  )}
                  {action.label}
                </Button>
              ))}
            </div>
          ) : entityLink ? (
            <Link href={entityLink} className="mt-2 inline-block">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-foreground/50 hover:text-dynamic-blue"
              >
                {t('view_details')} →
              </Button>
            </Link>
          ) : null}
        </div>

        {/* Quick actions */}
        <div
          className={cn(
            'flex flex-none transition-opacity duration-200',
            isUpdating ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-foreground/40 hover:bg-foreground/5 hover:text-foreground"
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
    </motion.div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ChangeDetails({
  changes,
  t,
}: {
  changes: Record<string, { old: unknown; new: unknown }>;
  t: TranslationFn;
}) {
  const changeEntries = Object.entries(changes);
  if (changeEntries.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-foreground/5 bg-foreground/[0.02] p-2.5">
      {changeEntries.map(([field, change]) => {
        const oldValue = change.old;
        const newValue = change.new;
        const isDescriptionChange = field === 'description';

        return (
          <div key={field} className="text-xs">
            <span className="font-medium text-foreground/60">
              {formatFieldName(field)}:
            </span>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-red-600 text-xs dark:text-red-400">
                {formatValue(oldValue, field)}
              </span>
              <span className="text-foreground/30">→</span>
              <span className="rounded bg-green-500/10 px-1.5 py-0.5 font-mono text-green-600 text-xs dark:text-green-400">
                {formatValue(newValue, field)}
              </span>
              {isDescriptionChange && (oldValue != null || newValue != null) ? (
                <DescriptionDiffViewer
                  oldValue={oldValue}
                  newValue={newValue}
                  t={t}
                  triggerVariant="inline"
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SingleChangeDetail({
  changeType,
  oldValue,
  newValue,
  t,
}: {
  changeType: string;
  oldValue?: unknown;
  newValue?: unknown;
  t: TranslationFn;
}) {
  const field = changeType.replace('task_', '').replace('_changed', '');

  if (!oldValue && !newValue) return null;

  const isDescriptionChange =
    field === 'description' || changeType === 'task_description_changed';

  return (
    <div className="mt-2 rounded-lg border border-foreground/5 bg-foreground/[0.02] p-2.5">
      <div className="text-xs">
        <span className="font-medium text-foreground/60">
          {formatFieldName(field)}:
        </span>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {oldValue != null && (
            <span className="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-red-600 text-xs dark:text-red-400">
              {formatValue(oldValue, field)}
            </span>
          )}
          {oldValue != null && newValue != null && (
            <span className="text-foreground/30">→</span>
          )}
          {newValue != null && (
            <span className="rounded bg-green-500/10 px-1.5 py-0.5 font-mono text-green-600 text-xs dark:text-green-400">
              {formatValue(newValue, field)}
            </span>
          )}
          {isDescriptionChange && (oldValue != null || newValue != null) ? (
            <DescriptionDiffViewer
              oldValue={oldValue}
              newValue={newValue}
              t={t}
              triggerVariant="inline"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Action Helpers
// ============================================================================

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
  t: (key: string) => string
): NotificationAction[] {
  const { type, data } = notification;

  switch (type) {
    case 'workspace_invite': {
      if (data?.action_taken) return [];

      const workspaceId = data?.workspace_id;
      if (!workspaceId) return [];

      return [
        {
          id: `decline-${notification.id}`,
          label: t('decline'),
          icon: <X className="h-3.5 w-3.5" />,
          variant: 'outline',
          type: 'WORKSPACE_INVITE_DECLINE',
          payload: { wsId: workspaceId },
        },
        {
          id: `accept-${notification.id}`,
          label: t('accept'),
          icon: <Check className="h-3.5 w-3.5" />,
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
