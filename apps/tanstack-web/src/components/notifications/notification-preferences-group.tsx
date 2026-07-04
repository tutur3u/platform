'use client';

import { ChevronDown, ChevronRight } from '@tuturuuu/icons';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'use-intl';
import { WORKSPACE_NOTIFICATION_CHANNELS } from './notification-event-groups';
import { NotificationPreferencesBulkActionButton } from './notification-preferences-bulk-action-button';
import type {
  EventType,
  NotificationEventGroup,
  PreferenceData,
  VisibleNotificationChannel,
} from './notification-preferences-types';
import { countGroupPreferences } from './notification-preferences-types';

type BulkAction = 'disable_all' | 'enable_all';

type NotificationPreferencesGroupProps = {
  bulkLoadingState?: BulkAction;
  group: NotificationEventGroup;
  isCollapsed: boolean;
  localPreferences: PreferenceData;
  onBulkAction: (groupId: string, action: BulkAction) => void;
  onToggleCollapse: (groupId: string) => void;
  onTogglePreference: (
    eventType: EventType,
    channel: VisibleNotificationChannel
  ) => void;
  savingStates: Set<string>;
};

export function NotificationPreferencesGroup({
  bulkLoadingState,
  group,
  isCollapsed,
  localPreferences,
  onBulkAction,
  onToggleCollapse,
  onTogglePreference,
  savingStates,
}: NotificationPreferencesGroupProps) {
  const tEvents = useTranslations('notifications.settings.events');
  const tGroups = useTranslations('notifications.settings.groups');
  const tChannels = useTranslations('notifications.settings.channels');
  const { enabled, total } = countGroupPreferences(group, localPreferences);
  const allEnabled = enabled === total;
  const noneEnabled = enabled === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
        <button
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${tGroups(group.labelKey as never)}`}
          className="flex items-center gap-2 font-semibold text-sm hover:text-foreground/80"
          onClick={() => onToggleCollapse(group.id)}
          type="button"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          <group.icon className="h-4 w-4" />
          <span>{tGroups(group.labelKey as never)}</span>
          <span
            className={
              allEnabled
                ? 'text-dynamic-green text-xs'
                : noneEnabled
                  ? 'text-muted-foreground text-xs'
                  : 'text-dynamic-yellow text-xs'
            }
          >
            ({enabled}/{total})
          </span>
        </button>

        <div className="flex gap-2">
          <NotificationPreferencesBulkActionButton
            action="enable_all"
            disabled={Boolean(bulkLoadingState) || allEnabled}
            groupId={group.id}
            loadingState={bulkLoadingState}
            onAction={onBulkAction}
          />
          <NotificationPreferencesBulkActionButton
            action="disable_all"
            disabled={Boolean(bulkLoadingState) || noneEnabled}
            groupId={group.id}
            loadingState={bulkLoadingState}
            onAction={onBulkAction}
          />
        </div>
      </div>

      {!isCollapsed ? (
        <div className="space-y-2">
          {group.events.map((eventType) => (
            <div
              className="grid grid-cols-4 items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
              key={eventType}
            >
              <div className="space-y-0.5">
                <p className="font-medium text-sm">
                  {tEvents(eventType as never)}
                </p>
              </div>
              {WORKSPACE_NOTIFICATION_CHANNELS.map((channel) => {
                const savingKey = `${eventType}-${channel}`;
                const isSaving = savingStates.has(savingKey);

                return (
                  <div className="flex justify-center" key={channel}>
                    <div className="relative">
                      <Switch
                        aria-label={`${tChannels(channel)} notifications for ${tEvents(eventType as never)}`}
                        checked={localPreferences[eventType]?.[channel] ?? true}
                        disabled={isSaving}
                        onCheckedChange={() =>
                          onTogglePreference(eventType, channel)
                        }
                      />
                      {isSaving ? (
                        <div className="absolute top-1/2 -right-5 -translate-y-1/2">
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
