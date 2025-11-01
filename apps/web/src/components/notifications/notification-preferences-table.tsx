'use client';

import {
  Bell,
  ChevronDown,
  ChevronRight,
  Search,
  Loader2,
} from '@tuturuuu/icons';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Switch } from '@tuturuuu/ui/switch';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useMemo } from 'react';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  usePreferenceValue,
  type NotificationChannel,
  type NotificationEventType,
} from '@/hooks/useNotificationPreferences';
import {
  useAccountNotificationPreferences,
  useUpdateAccountNotificationPreferences,
  useAccountPreferenceValue,
  type AccountNotificationEventType,
} from '@/hooks/useAccountNotificationPreferences';
import {
  WORKSPACE_EVENT_GROUPS,
  ACCOUNT_EVENT_GROUPS,
  type EventGroup,
} from '@/constants/notification-event-groups';

type EventType = NotificationEventType | AccountNotificationEventType;
type PreferenceData = Record<string, Record<string, boolean>>;

interface NotificationPreferencesTableProps {
  scope: 'workspace' | 'account';
  wsId?: string;
  showAdvanced?: boolean;
}

const CHANNELS: NotificationChannel[] = ['web', 'email', 'push'];

export default function NotificationPreferencesTable({
  scope,
  wsId,
  showAdvanced = false,
}: NotificationPreferencesTableProps) {
  const t = useTranslations('notifications.settings');
  const tEvents = useTranslations('notifications.settings.events');
  const tGroups = useTranslations('notifications.settings.groups');
  const tChannels = useTranslations('notifications.settings.channels');

  // Determine which hooks to use based on scope
  const isWorkspace = scope === 'workspace';
  const workspaceQuery = useNotificationPreferences({ wsId: wsId || '' });
  const accountQuery = useAccountNotificationPreferences();
  const updateWorkspace = useUpdateNotificationPreferences();
  const updateAccount = useUpdateAccountNotificationPreferences();

  const { data: preferences, isLoading } = isWorkspace
    ? workspaceQuery
    : accountQuery;
  const updatePreferences = isWorkspace ? updateWorkspace : updateAccount;

  // Get the appropriate event groups
  const eventGroups = isWorkspace
    ? WORKSPACE_EVENT_GROUPS
    : ACCOUNT_EVENT_GROUPS;

  // Local state
  const [localPreferences, setLocalPreferences] = useState<PreferenceData>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [savingStates, setSavingStates] = useState<Set<string>>(new Set());
  const [bulkLoadingStates, setBulkLoadingStates] = useState<
    Map<string, 'enable_all' | 'disable_all'>
  >(new Map());
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  // Initialize preferences - create missing rows in database (only on first load)
  useEffect(() => {
    if (!preferences || hasInitialized || isInitializing) return;

    // Build a map of what exists in the database
    const existingPrefs = new Map<string, boolean>();
    preferences.forEach((pref) => {
      const key = `${pref.event_type}-${pref.channel}`;
      existingPrefs.set(key, pref.enabled);
    });

    // Build local preferences from existing data
    const prefs: PreferenceData = {};
    eventGroups.forEach((group) => {
      group.events.forEach((eventType) => {
        prefs[eventType] = {};
        CHANNELS.forEach((channel) => {
          const key = `${eventType}-${channel}`;
          prefs[eventType][channel] = existingPrefs.get(key) ?? true;
        });
      });
    });
    setLocalPreferences(prefs);

    // Find missing preferences that need to be created
    const missingPreferences: Array<{
      eventType: any;
      channel: NotificationChannel;
      enabled: boolean;
    }> = [];

    eventGroups.forEach((group) => {
      group.events.forEach((eventType) => {
        CHANNELS.forEach((channel) => {
          const key = `${eventType}-${channel}`;
          if (!existingPrefs.has(key)) {
            missingPreferences.push({
              eventType: eventType as any,
              channel,
              enabled: true, // Default to enabled
            });
          }
        });
      });
    });

    // Create missing preferences in the database (only once)
    if (missingPreferences.length > 0) {
      setIsInitializing(true);

      const createMissing = async () => {
        try {
          if (isWorkspace && wsId) {
            await updateWorkspace.mutateAsync({
              wsId,
              preferences: missingPreferences as any,
            });
          } else {
            await updateAccount.mutateAsync({
              preferences: missingPreferences as any,
            });
          }
        } catch (error) {
          console.error('Error initializing preferences:', error);
        } finally {
          setIsInitializing(false);
          setHasInitialized(true);
        }
      };

      createMissing();
    } else {
      // No missing preferences, mark as initialized
      setHasInitialized(true);
    }
  }, [preferences, hasInitialized, isInitializing]);

  // Update local preferences from fetched data (after initialization, on subsequent updates)
  useEffect(() => {
    if (!preferences || !hasInitialized) return;

    const prefs: PreferenceData = {};
    const existingPrefs = new Map<string, boolean>();

    preferences.forEach((pref) => {
      const key = `${pref.event_type}-${pref.channel}`;
      existingPrefs.set(key, pref.enabled);
    });

    eventGroups.forEach((group) => {
      group.events.forEach((eventType) => {
        prefs[eventType] = {};
        CHANNELS.forEach((channel) => {
          const key = `${eventType}-${channel}`;
          prefs[eventType][channel] = existingPrefs.get(key) ?? true;
        });
      });
    });

    setLocalPreferences(prefs);
  }, [preferences, hasInitialized]);

  // Filter groups based on search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return eventGroups;

    const query = searchQuery.toLowerCase();
    return eventGroups
      .map((group) => ({
        ...group,
        events: group.events.filter((event) =>
          tEvents(event as any)
            .toLowerCase()
            .includes(query)
        ),
      }))
      .filter((group) => group.events.length > 0);
  }, [searchQuery, eventGroups, tEvents]);

  // Auto-save handler with debouncing
  const handleToggle = async (
    eventType: EventType,
    channel: NotificationChannel
  ) => {
    // Calculate the new value first
    const currentValue = localPreferences[eventType]?.[channel] ?? true;
    const newValue = !currentValue;

    // Extract current advanced settings from existing preferences
    // to preserve them when updating individual preferences
    const existingPref = preferences?.find(
      (p) => p.event_type === eventType && p.channel === channel
    );
    const advancedSettings = {
      digestFrequency: existingPref?.digest_frequency,
      quietHoursStart: existingPref?.quiet_hours_start,
      quietHoursEnd: existingPref?.quiet_hours_end,
      timezone: existingPref?.timezone,
    };

    // Update local state immediately (optimistic update)
    setLocalPreferences((prev) => {
      const newPrefs = { ...prev };
      if (!newPrefs[eventType]) {
        newPrefs[eventType] = {};
      }
      newPrefs[eventType][channel] = newValue;
      return newPrefs;
    });

    // Mark this preference as saving
    const savingKey = `${eventType}-${channel}`;
    setSavingStates((prev) => new Set(prev).add(savingKey));

    try {
      // Save immediately (auto-save)
      const preferencesToSave = [
        {
          eventType: eventType as any,
          channel,
          enabled: newValue,
        },
      ];

      if (isWorkspace && wsId) {
        await updateWorkspace.mutateAsync({
          wsId,
          preferences: preferencesToSave as any,
          ...advancedSettings,
        });
      } else {
        await updateAccount.mutateAsync({
          preferences: preferencesToSave as any,
          ...advancedSettings,
        });
      }
    } catch (error) {
      // Rollback on error - restore the original value
      setLocalPreferences((prev) => {
        const newPrefs = { ...prev };
        newPrefs[eventType][channel] = currentValue;
        return newPrefs;
      });
      toast.error(t('save-failed'));
      console.error('Error saving preference:', error);
    } finally {
      // Remove saving indicator
      setSavingStates((prev) => {
        const newSet = new Set(prev);
        newSet.delete(savingKey);
        return newSet;
      });
    }
  };

  // Bulk actions
  const handleBulkAction = async (
    groupId: string,
    action: 'enable_all' | 'disable_all'
  ) => {
    const group = eventGroups.find((g) => g.id === groupId);
    if (!group) return;

    // Mark this specific action as loading
    setBulkLoadingStates((prev) => new Map(prev).set(groupId, action));

    const enabled = action === 'enable_all';
    const preferencesToSave: Array<{
      eventType: any;
      channel: NotificationChannel;
      enabled: boolean;
    }> = [];

    // Extract advanced settings from first existing preference in the group
    // to preserve them during bulk update
    const firstExistingPref = preferences?.find((p) =>
      group.events.some((event) => p.event_type === event)
    );
    const advancedSettings = {
      digestFrequency: firstExistingPref?.digest_frequency,
      quietHoursStart: firstExistingPref?.quiet_hours_start,
      quietHoursEnd: firstExistingPref?.quiet_hours_end,
      timezone: firstExistingPref?.timezone,
    };

    // Update local state
    setLocalPreferences((prev) => {
      const newPrefs = { ...prev };
      group.events.forEach((eventType) => {
        if (!newPrefs[eventType]) {
          newPrefs[eventType] = {};
        }
        CHANNELS.forEach((channel) => {
          newPrefs[eventType][channel] = enabled;
          preferencesToSave.push({
            eventType: eventType as any,
            channel,
            enabled,
          });
        });
      });
      return newPrefs;
    });

    try {
      if (isWorkspace && wsId) {
        await updateWorkspace.mutateAsync({
          wsId,
          preferences: preferencesToSave as any,
          ...advancedSettings,
        });
      } else {
        await updateAccount.mutateAsync({
          preferences: preferencesToSave as any,
          ...advancedSettings,
        });
      }
      toast.success(t('bulk-action-success'));
    } catch (error) {
      toast.error(t('bulk-action-failed'));
      console.error('Error in bulk action:', error);
    } finally {
      // Remove loading state
      setBulkLoadingStates((prev) => {
        const newMap = new Map(prev);
        newMap.delete(groupId);
        return newMap;
      });
    }
  };

  // Check if all preferences in a group are enabled/disabled
  const areAllEnabled = (groupId: string): boolean => {
    const group = eventGroups.find((g) => g.id === groupId);
    if (!group) return false;

    return group.events.every((eventType) =>
      CHANNELS.every(
        (channel) => localPreferences[eventType]?.[channel] === true
      )
    );
  };

  const areAllDisabled = (groupId: string): boolean => {
    const group = eventGroups.find((g) => g.id === groupId);
    if (!group) return false;

    return group.events.every((eventType) =>
      CHANNELS.every(
        (channel) => localPreferences[eventType]?.[channel] === false
      )
    );
  };

  // Calculate enabled count for a group
  const getGroupEnabledCount = (
    groupId: string
  ): { enabled: number; total: number } => {
    const group = eventGroups.find((g) => g.id === groupId);
    if (!group) return { enabled: 0, total: 0 };

    let enabledCount = 0;
    let totalCount = 0;

    group.events.forEach((eventType) => {
      CHANNELS.forEach((channel) => {
        totalCount++;
        if (localPreferences[eventType]?.[channel] === true) {
          enabledCount++;
        }
      });
    });

    return { enabled: enabledCount, total: totalCount };
  };

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  // Only show skeleton during initial data fetch, not during background initialization
  if (isLoading && !hasInitialized) {
    return <LoadingSkeleton />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-dynamic-blue/20 p-2">
            <Bell className="h-5 w-5 text-dynamic-blue" />
          </div>
          <div className="flex-1">
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('search-events')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            aria-label={t('search-events')}
          />
        </div>

        {/* Table */}
        <div className="space-y-4">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 grid grid-cols-4 gap-4 border-b bg-background pb-2">
            <div className="font-medium text-sm">{t('event')}</div>
            {CHANNELS.map((channel) => (
              <div key={channel} className="text-center font-medium text-sm">
                {tChannels(channel)}
              </div>
            ))}
          </div>

          {/* Event groups */}
          {filteredGroups.map((group) => {
            const { enabled, total } = getGroupEnabledCount(group.id);
            const allEnabled = enabled === total;
            const noneEnabled = enabled === 0;

            return (
              <div key={group.id} className="space-y-2">
                {/* Group header */}
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <button
                    onClick={() => toggleGroupCollapse(group.id)}
                    className="flex items-center gap-2 text-sm font-semibold hover:text-foreground/80"
                    aria-expanded={!collapsedGroups.has(group.id)}
                    aria-label={`${collapsedGroups.has(group.id) ? 'Expand' : 'Collapse'} ${tGroups(group.labelKey as any)}`}
                  >
                    {collapsedGroups.has(group.id) ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    <group.icon className="h-4 w-4" />
                    <span>{tGroups(group.labelKey as any)}</span>
                    <span
                      className={`text-xs ${
                        allEnabled
                          ? 'text-dynamic-green'
                          : noneEnabled
                            ? 'text-muted-foreground'
                            : 'text-dynamic-yellow'
                      }`}
                    >
                      ({enabled}/{total})
                    </span>
                  </button>

                  {/* Bulk actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleBulkAction(group.id, 'enable_all')}
                      disabled={
                        bulkLoadingStates.has(group.id) ||
                        areAllEnabled(group.id)
                      }
                      className="h-7 text-xs"
                      aria-label={`Enable all notifications in ${tGroups(group.labelKey as any)}`}
                    >
                      {bulkLoadingStates.get(group.id) === 'enable_all' && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      {t('enable-all')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleBulkAction(group.id, 'disable_all')}
                      disabled={
                        bulkLoadingStates.has(group.id) ||
                        areAllDisabled(group.id)
                      }
                      className="h-7 text-xs"
                      aria-label={`Disable all notifications in ${tGroups(group.labelKey as any)}`}
                    >
                      {bulkLoadingStates.get(group.id) === 'disable_all' && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      {t('disable-all')}
                    </Button>
                  </div>
                </div>

                {/* Group events */}
                {!collapsedGroups.has(group.id) && (
                  <div className="space-y-2">
                    {group.events.map((eventType) => (
                      <div
                        key={eventType}
                        className="grid grid-cols-4 items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                      >
                        <div className="space-y-0.5">
                          <p className="font-medium text-sm">
                            {tEvents(eventType as any)}
                          </p>
                        </div>
                        {CHANNELS.map((channel) => {
                          const savingKey = `${eventType}-${channel}`;
                          const isSaving = savingStates.has(savingKey);

                          return (
                            <div key={channel} className="flex justify-center">
                              <div className="relative">
                                <Switch
                                  checked={
                                    localPreferences[eventType]?.[channel] ??
                                    true
                                  }
                                  onCheckedChange={() =>
                                    handleToggle(eventType, channel)
                                  }
                                  disabled={isSaving}
                                  aria-label={`${tChannels(channel)} notifications for ${tEvents(eventType as any)}`}
                                />
                                {isSaving && (
                                  <div className="absolute -right-5 top-1/2 -translate-y-1/2">
                                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {filteredGroups.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-muted-foreground text-sm">
                {t('no-events-found')}
              </p>
            </div>
          )}
        </div>

        {/* Info text */}
        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-muted-foreground text-xs">{t('auto-save-info')}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
