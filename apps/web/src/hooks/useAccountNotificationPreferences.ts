import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type NotificationChannel = 'web' | 'email' | 'push';
export type AccountNotificationEventType =
  | 'email_notifications'
  | 'push_notifications'
  | 'marketing_communications'
  | 'security_alerts'
  | 'workspace_activity';

export interface AccountNotificationPreference {
  id: string;
  ws_id: null;
  user_id: string;
  event_type: AccountNotificationEventType;
  channel: NotificationChannel;
  enabled: boolean;
  scope: 'user';
  created_at: string;
  updated_at: string;
}

/**
 * Hook to fetch account-level notification preferences
 */
export function useAccountNotificationPreferences() {
  return useQuery({
    queryKey: ['account-notification-preferences'],
    queryFn: async () => {
      const response = await fetch('/api/v1/notifications/account-preferences');
      if (!response.ok) {
        throw new Error('Failed to fetch account notification preferences');
      }

      const data = await response.json();
      return data.preferences as AccountNotificationPreference[];
    },
  });
}

/**
 * Hook to update account-level notification preferences
 */
export function useUpdateAccountNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      preferences,
    }: {
      preferences: Array<{
        eventType: AccountNotificationEventType;
        channel: NotificationChannel;
        enabled: boolean;
      }>;
    }) => {
      const response = await fetch(
        '/api/v1/notifications/account-preferences',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            preferences,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update account notification preferences');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate the account preferences query
      queryClient.invalidateQueries({
        queryKey: ['account-notification-preferences'],
      });
    },
  });
}

/**
 * Helper to get preference value for a specific event type and channel
 * Note: This assumes the preference exists in the database.
 * The UI should create missing preferences on initialization.
 */
export function useAccountPreferenceValue(
  preferences: AccountNotificationPreference[] | undefined,
  eventType: AccountNotificationEventType,
  channel: NotificationChannel
): boolean {
  if (!preferences) return true;

  const preference = preferences.find(
    (p) => p.event_type === eventType && p.channel === channel
  );

  return preference?.enabled ?? true;
}
