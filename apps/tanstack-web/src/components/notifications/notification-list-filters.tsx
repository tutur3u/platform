'use client';

import { AtSign, Bell, CheckCircle2, Inbox } from '@tuturuuu/icons';
import type {
  NotificationPriority,
  NotificationType,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'use-intl';
import type {
  NotificationsSearch,
  NotificationsTab,
} from '@/lib/notifications/notification-list-route-data';

type NotificationsListFiltersProps = {
  counts: Record<NotificationsTab, number>;
  onUpdate: (updates: Partial<NotificationsSearch>) => void;
  search: NotificationsSearch;
};

const tabs: Array<{
  icon: typeof Bell;
  id: NotificationsTab;
  labelKey: string;
}> = [
  { icon: Inbox, id: 'all', labelKey: 'tab_all' },
  { icon: Bell, id: 'unread', labelKey: 'tab_unread' },
  { icon: AtSign, id: 'mentions', labelKey: 'tab_mentions' },
  { icon: CheckCircle2, id: 'tasks', labelKey: 'tab_tasks' },
];

const types: NotificationType[] = [
  'task_assigned',
  'task_mention',
  'task_updated',
  'task_completed',
  'deadline_reminder',
  'post_approved',
  'post_rejected',
  'report_approved',
  'report_rejected',
  'workspace_invite',
  'system_announcement',
  'security_alert',
  'time_tracking_request_submitted',
  'time_tracking_request_approved',
  'time_tracking_request_rejected',
];

const priorities: NotificationPriority[] = ['urgent', 'high', 'medium', 'low'];

export function NotificationListFilters({
  counts,
  onUpdate,
  search,
}: NotificationsListFiltersProps) {
  const t = useTranslations('notifications');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = search.tab === tab.id;

          return (
            <Button
              className={cn('gap-2', active && 'border-dynamic-blue/40')}
              key={tab.id}
              onClick={() =>
                onUpdate({
                  page: 1,
                  tab: tab.id,
                  type: '',
                })
              }
              size="sm"
              type="button"
              variant={active ? 'secondary' : 'outline'}
            >
              <Icon className="h-4 w-4" />
              <span>{t(tab.labelKey)}</span>
              {counts[tab.id] > 0 && (
                <span className="rounded-full bg-dynamic-blue/10 px-1.5 py-0.5 text-dynamic-blue text-xs">
                  {counts[tab.id] > 99 ? '99+' : counts[tab.id]}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          onValueChange={(value) =>
            onUpdate({
              page: 1,
              priority: value === 'all' ? '' : (value as NotificationPriority),
            })
          }
          value={search.priority || 'all'}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('filter_priority')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filter_all_priorities')}</SelectItem>
            {priorities.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {t(`priorities.${priority}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          onValueChange={(value) =>
            onUpdate({
              page: 1,
              scope:
                value === 'all' ? '' : (value as NotificationsSearch['scope']),
            })
          }
          value={search.scope || 'all'}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('filter_scope')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filter_all_scopes')}</SelectItem>
            <SelectItem value="workspace">{t('scopes.workspace')}</SelectItem>
            <SelectItem value="user">{t('scopes.user')}</SelectItem>
            <SelectItem value="system">{t('scopes.system')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          onValueChange={(value) =>
            onUpdate({
              page: 1,
              tab: value === 'all' ? search.tab : 'all',
              type: value === 'all' ? '' : (value as NotificationType),
            })
          }
          value={search.type || 'all'}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('filter_type')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filter_all_types')}</SelectItem>
            {types.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`types.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
