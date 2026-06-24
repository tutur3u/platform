import type { LucideIcon } from '@tuturuuu/icons';
import type {
  AccountNotificationChannel,
  AccountNotificationEventType,
  AccountNotificationPreference,
  AccountNotificationPreferenceUpdate,
  WorkspaceNotificationEventType,
  WorkspaceNotificationPreference,
  WorkspaceNotificationPreferenceUpdate,
} from '@tuturuuu/internal-api';
import { WORKSPACE_NOTIFICATION_CHANNELS } from './notification-event-groups';

export type PreferenceData = Record<string, Record<string, boolean>>;
export type Preference =
  | AccountNotificationPreference
  | WorkspaceNotificationPreference;
export type EventType =
  | AccountNotificationEventType
  | WorkspaceNotificationEventType;
export type VisibleNotificationChannel =
  (typeof WORKSPACE_NOTIFICATION_CHANNELS)[number];
export type PreferenceUpdateInput = {
  channel: AccountNotificationChannel | VisibleNotificationChannel;
  enabled: boolean;
  eventType: EventType;
};
export type NotificationPreferencesTableProps =
  | {
      preferences: WorkspaceNotificationPreference[];
      scope: 'workspace';
      updatePreferences: (
        preferences: WorkspaceNotificationPreferenceUpdate[]
      ) => Promise<void>;
      workspaceId: string;
    }
  | {
      preferences: AccountNotificationPreference[];
      scope: 'account';
      updatePreferences: (
        preferences: AccountNotificationPreferenceUpdate[]
      ) => Promise<void>;
      workspaceId?: never;
    };
export type NotificationEventGroup = {
  descriptionKey: string;
  events: readonly EventType[];
  icon: LucideIcon;
  id: string;
  labelKey: string;
};
export type NotificationEventGroups = readonly NotificationEventGroup[];

export function buildPreferenceMap(
  preferences: Preference[],
  eventGroups: NotificationEventGroups
) {
  const existingPrefs = new Map<string, boolean>();
  for (const pref of preferences) {
    existingPrefs.set(`${pref.event_type}-${pref.channel}`, pref.enabled);
  }

  const prefs: PreferenceData = {};
  for (const group of eventGroups) {
    for (const eventType of group.events) {
      prefs[eventType] = {};
      for (const channel of WORKSPACE_NOTIFICATION_CHANNELS) {
        prefs[eventType][channel] =
          existingPrefs.get(`${eventType}-${channel}`) ?? true;
      }
    }
  }

  return prefs;
}

export function missingPreferences(
  preferences: Preference[],
  eventGroups: NotificationEventGroups
) {
  const existingPrefs = new Set(
    preferences.map((pref) => `${pref.event_type}-${pref.channel}`)
  );

  return eventGroups.flatMap((group) =>
    group.events.flatMap((eventType) =>
      WORKSPACE_NOTIFICATION_CHANNELS.filter(
        (channel) => !existingPrefs.has(`${eventType}-${channel}`)
      ).map((channel) => ({
        channel,
        enabled: true,
        eventType,
      }))
    )
  );
}

export function countGroupPreferences(
  group: NotificationEventGroup,
  localPreferences: PreferenceData
) {
  let enabled = 0;
  let total = 0;

  for (const eventType of group.events) {
    for (const channel of WORKSPACE_NOTIFICATION_CHANNELS) {
      total += 1;
      if (localPreferences[eventType]?.[channel] === true) {
        enabled += 1;
      }
    }
  }

  return { enabled, total };
}
