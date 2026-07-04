'use client';

import { Bell, Search } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'use-intl';
import { WORKSPACE_NOTIFICATION_CHANNELS } from './notification-event-groups';
import { NotificationPreferencesGroup } from './notification-preferences-group';
import { NotificationPreferencesLoadingSkeleton } from './notification-preferences-loading-skeleton';
import type { NotificationPreferencesTableProps } from './notification-preferences-types';
import { useNotificationPreferencesTable } from './use-notification-preferences-table';

export function NotificationPreferencesTable(
  props: NotificationPreferencesTableProps
) {
  const t = useTranslations('notifications.settings');
  const tChannels = useTranslations('notifications.settings.channels');
  const {
    bulkLoadingStates,
    collapsedGroups,
    filteredGroups,
    handleBulkAction,
    handleToggle,
    hasInitialized,
    localPreferences,
    savingStates,
    searchQuery,
    setSearchQuery,
    toggleGroupCollapse,
  } = useNotificationPreferencesTable(props);

  if (!hasInitialized) {
    return <NotificationPreferencesLoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-dynamic-blue/20 p-2.5">
          <Bell className="h-5 w-5 text-dynamic-blue" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">{t('title')}</h3>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t('search-events')}
          className="pl-9"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t('search-events')}
          value={searchQuery}
        />
      </div>

      <div className="space-y-4">
        <div className="sticky -top-6 z-10 grid grid-cols-4 gap-4 border-b bg-background p-2">
          <div className="font-medium text-sm">{t('event')}</div>
          {WORKSPACE_NOTIFICATION_CHANNELS.map((channel) => (
            <div className="text-center font-medium text-sm" key={channel}>
              {tChannels(channel)}
            </div>
          ))}
        </div>

        {filteredGroups.map((group) => (
          <NotificationPreferencesGroup
            bulkLoadingState={bulkLoadingStates.get(group.id)}
            group={group}
            isCollapsed={collapsedGroups.has(group.id)}
            key={group.id}
            localPreferences={localPreferences}
            onBulkAction={handleBulkAction}
            onToggleCollapse={toggleGroupCollapse}
            onTogglePreference={handleToggle}
            savingStates={savingStates}
          />
        ))}

        {filteredGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground text-sm">
              {t('no-events-found')}
            </p>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-muted-foreground text-xs">{t('auto-save-info')}</p>
      </div>
    </div>
  );
}
