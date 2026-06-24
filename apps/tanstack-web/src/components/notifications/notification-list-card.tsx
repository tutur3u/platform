'use client';

import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  Mail,
  Shield,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'use-intl';
import type { NotificationListItem } from '@/lib/notifications/notification-list-route-data';
import {
  formatNotificationDate,
  formatNotificationType,
  getNotificationBody,
} from './notification-list-utils';

type NotificationListCardProps = {
  locale: string;
  notification: NotificationListItem;
  unreadLabel: string;
};

function getNotificationIcon(type: NotificationListItem['type']) {
  if (type === 'security_alert') {
    return Shield;
  }

  if (type === 'workspace_invite') {
    return Mail;
  }

  if (type === 'deadline_reminder' || type.startsWith('time_tracking_')) {
    return Clock;
  }

  if (
    type.endsWith('_approved') ||
    type === 'task_completed' ||
    type === 'task_reopened'
  ) {
    return CheckCircle2;
  }

  if (type.endsWith('_rejected')) {
    return AlertCircle;
  }

  return Bell;
}

export function NotificationListCard({
  locale,
  notification,
  unreadLabel,
}: NotificationListCardProps) {
  const t = useTranslations('notifications');
  const Icon = getNotificationIcon(notification.type);
  const body = getNotificationBody(notification);
  const unread = !notification.read_at;

  return (
    <Card
      className={cn(
        'border-border/70 transition-colors',
        unread && 'border-dynamic-blue/30 bg-dynamic-blue/5'
      )}
    >
      <CardContent className="flex gap-4 p-4">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="line-clamp-2 font-semibold text-sm">
                {notification.title}
              </h2>
              <p className="text-muted-foreground text-xs">
                {formatNotificationDate(notification.created_at, locale)}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              {unread && (
                <Badge className="bg-dynamic-blue/10 text-dynamic-blue">
                  {unreadLabel}
                </Badge>
              )}
              <Badge variant="secondary">
                {notification.priority
                  ? t(`priorities.${notification.priority}`)
                  : t('priorities.normal')}
              </Badge>
            </div>
          </div>

          {body && (
            <p className="line-clamp-3 text-muted-foreground text-sm">{body}</p>
          )}

          <div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
            <span>{formatNotificationType(notification.type)}</span>
            {notification.scope && (
              <span>
                {t('scope_label')}: {t(`scopes.${notification.scope}`)}
              </span>
            )}
            {notification.data?.workspace_name &&
              typeof notification.data.workspace_name === 'string' && (
                <span>{notification.data.workspace_name}</span>
              )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
