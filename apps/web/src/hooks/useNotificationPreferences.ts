import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export type NotificationChannel = 'web' | 'email' | 'sms' | 'push';
export type NotificationEventType = 'task_assigned' | 'task_updated' | 'task_mention' | 'workspace_invite';

export interface NotificationPreference {
  id: string;
  ws_id: string;
  user_id: string;
  event_type: NotificationEventType;
  channel: NotificationChannel;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface UseNotificationPreferencesOptions {
  wsId: string;
}

/**
 * Hook to fetch notification preferences for a workspace
 */
export function useNotificationPreferences({ wsId }: UseNotificationPreferencesOptions) {
  return useQuery({
    queryKey: ['notification-preferences', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/notifications/preferences?wsId=${wsId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch notification preferences');
      }

      const data = await response.json();
      return data.preferences as NotificationPreference[];
    },
    enabled: !!wsId,
  });
}

/**
 * Hook to update notification preferences
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      wsId,
      preferences,
    }: {
      wsId: string;
      preferences: Array<{
        eventType: NotificationEventType;
        channel: NotificationChannel;
        enabled: boolean;
      }>;
    }) => {
      const response = await fetch('/api/v1/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wsId, preferences }),
      });

      if (!response.ok) {
        throw new Error('Failed to update notification preferences');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate the preferences query for this workspace
      queryClient.invalidateQueries({
        queryKey: ['notification-preferences', variables.wsId],
      });
    },
  });
}

/**
 * Helper hook to get preference value for a specific event type and channel
 */
export function usePreferenceValue(
  preferences: NotificationPreference[] | undefined,
  eventType: NotificationEventType,
  channel: NotificationChannel
): boolean {
  if (!preferences) return true; // Default to enabled if no preferences set

  const preference = preferences.find(
    (p) => p.event_type === eventType && p.channel === channel
  );

  return preference?.enabled ?? true; // Default to enabled
}
