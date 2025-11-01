import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export type NotificationChannel = 'web' | 'email' | 'push';
export type NotificationEventType =
  // Task assignment and general updates
  | 'task_assigned'
  | 'task_updated'
  | 'task_mention'
  // Task field changes
  | 'task_title_changed'
  | 'task_description_changed'
  | 'task_priority_changed'
  | 'task_due_date_changed'
  | 'task_start_date_changed'
  | 'task_estimation_changed'
  | 'task_moved'
  // Task status changes
  | 'task_completed'
  | 'task_reopened'
  // Task relationships
  | 'task_label_added'
  | 'task_label_removed'
  | 'task_project_linked'
  | 'task_project_unlinked'
  | 'task_assignee_removed'
  // Workspace
  | 'workspace_invite';

export interface NotificationPreference {
  id: string;
  ws_id: string;
  user_id: string;
  event_type: NotificationEventType;
  channel: NotificationChannel;
  enabled: boolean;
  scope?: 'user' | 'workspace' | 'system';
  digest_frequency?: 'immediate' | 'hourly' | 'daily' | 'weekly';
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  timezone?: string;
  created_at: string;
  updated_at: string;
}

interface UseNotificationPreferencesOptions {
  wsId: string;
}

/**
 * Hook to fetch notification preferences for a workspace
 */
export function useNotificationPreferences({
  wsId,
}: UseNotificationPreferencesOptions) {
  return useQuery({
    queryKey: ['notification-preferences', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/notifications/preferences?wsId=${wsId}`
      );
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
      digestFrequency,
      quietHoursStart,
      quietHoursEnd,
      timezone,
    }: {
      wsId: string;
      preferences: Array<{
        eventType: NotificationEventType;
        channel: NotificationChannel;
        enabled: boolean;
      }>;
      digestFrequency?: 'immediate' | 'hourly' | 'daily' | 'weekly';
      quietHoursStart?: string;
      quietHoursEnd?: string;
      timezone?: string;
    }) => {
      const response = await fetch('/api/v1/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wsId,
          preferences,
          digestFrequency,
          quietHoursStart,
          quietHoursEnd,
          timezone,
        }),
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
 * Note: This assumes the preference exists in the database.
 * The UI should create missing preferences on initialization.
 */
export function usePreferenceValue(
  preferences: NotificationPreference[] | undefined,
  eventType: NotificationEventType,
  channel: NotificationChannel
): boolean {
  if (!preferences) return true;

  const preference = preferences.find(
    (p) => p.event_type === eventType && p.channel === channel
  );

  return preference?.enabled ?? true;
}
