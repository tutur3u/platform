'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import {
  ACCOUNT_EVENT_GROUPS,
  WORKSPACE_EVENT_GROUPS,
  WORKSPACE_NOTIFICATION_CHANNELS,
} from './notification-event-groups';
import {
  buildPreferenceMap,
  type EventType,
  missingPreferences,
  type NotificationPreferencesTableProps,
  type PreferenceData,
  type PreferenceUpdateInput,
  type VisibleNotificationChannel,
} from './notification-preferences-types';
import {
  accountNotificationPreferencesQueryKey,
  workspaceNotificationPreferencesQueryKey,
} from './query-keys';

type BulkAction = 'disable_all' | 'enable_all';

export function useNotificationPreferencesTable(
  props: NotificationPreferencesTableProps
) {
  const t = useTranslations('notifications.settings');
  const tEvents = useTranslations('notifications.settings.events');
  const queryClient = useQueryClient();
  const isWorkspace = props.scope === 'workspace';
  const eventGroups = isWorkspace
    ? WORKSPACE_EVENT_GROUPS
    : ACCOUNT_EVENT_GROUPS;
  const queryKey = useMemo(
    () =>
      isWorkspace
        ? workspaceNotificationPreferencesQueryKey(props.workspaceId)
        : accountNotificationPreferencesQueryKey,
    [isWorkspace, props.workspaceId]
  );
  const [localPreferences, setLocalPreferences] = useState<PreferenceData>(() =>
    buildPreferenceMap(props.preferences, eventGroups)
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [savingStates, setSavingStates] = useState<Set<string>>(new Set());
  const [bulkLoadingStates, setBulkLoadingStates] = useState<
    Map<string, BulkAction>
  >(new Map());
  const [hasInitialized, setHasInitialized] = useState(false);

  const mutation = useMutation({
    mutationFn: (updates: PreferenceUpdateInput[]) =>
      props.updatePreferences(updates as never),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  useEffect(() => {
    setLocalPreferences(buildPreferenceMap(props.preferences, eventGroups));
  }, [eventGroups, props.preferences]);

  useEffect(() => {
    if (hasInitialized) {
      return;
    }

    const missing = missingPreferences(props.preferences, eventGroups);
    setHasInitialized(true);

    if (missing.length === 0) {
      return;
    }

    props
      .updatePreferences(missing as never)
      .then(() => queryClient.invalidateQueries({ queryKey }))
      .catch(() => undefined);
  }, [
    eventGroups,
    hasInitialized,
    props.preferences,
    props.updatePreferences,
    queryClient,
    queryKey,
  ]);

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return eventGroups;
    }

    return eventGroups
      .map((group) => ({
        ...group,
        events: group.events.filter((event) =>
          tEvents(event as never)
            .toLowerCase()
            .includes(query)
        ),
      }))
      .filter((group) => group.events.length > 0);
  }, [eventGroups, searchQuery, tEvents]);

  const handleToggle = async (
    eventType: EventType,
    channel: VisibleNotificationChannel
  ) => {
    const currentValue = localPreferences[eventType]?.[channel] ?? true;
    const nextValue = !currentValue;
    const savingKey = `${eventType}-${channel}`;

    setLocalPreferences((prev) => ({
      ...prev,
      [eventType]: { ...prev[eventType], [channel]: nextValue },
    }));
    setSavingStates((prev) => new Set(prev).add(savingKey));

    try {
      await mutation.mutateAsync([{ channel, enabled: nextValue, eventType }]);
    } catch {
      setLocalPreferences((prev) => ({
        ...prev,
        [eventType]: { ...prev[eventType], [channel]: currentValue },
      }));
      toast.error(t('save-failed'));
    } finally {
      setSavingStates((prev) => {
        const next = new Set(prev);
        next.delete(savingKey);
        return next;
      });
    }
  };

  const handleBulkAction = async (groupId: string, action: BulkAction) => {
    const group = eventGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const enabled = action === 'enable_all';
    const updates = group.events.flatMap((eventType) =>
      WORKSPACE_NOTIFICATION_CHANNELS.map((channel) => ({
        channel,
        enabled,
        eventType,
      }))
    );

    setBulkLoadingStates((prev) => new Map(prev).set(groupId, action));
    setLocalPreferences((prev) => {
      const next = { ...prev };
      for (const eventType of group.events) {
        next[eventType] = { ...next[eventType] };
        for (const channel of WORKSPACE_NOTIFICATION_CHANNELS) {
          next[eventType][channel] = enabled;
        }
      }
      return next;
    });

    try {
      await mutation.mutateAsync(updates);
      toast.success(t('bulk-action-success'));
    } catch {
      toast.error(t('bulk-action-failed'));
      setLocalPreferences(buildPreferenceMap(props.preferences, eventGroups));
    } finally {
      setBulkLoadingStates((prev) => {
        const next = new Map(prev);
        next.delete(groupId);
        return next;
      });
    }
  };

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return {
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
  };
}
