'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUserIdentity } from '@tuturuuu/ui/hooks/use-current-user-identity';
import { getTaskApiUrl } from '@tuturuuu/ui/lib/tasks-app-url';
import { onSessionEnding } from '@tuturuuu/utils/session-events';
import { useEffect } from 'react';

interface TaskSettingsData {
  task_auto_assign_to_self: boolean;
  fade_completed_tasks: boolean;
}

/**
 * Initializes the fade completed tasks setting on page load.
 * Only fetches user settings from API if user is logged in.
 * Sets the body data attribute based on user preferences.
 */
export function FadeSettingInitializer() {
  const queryClient = useQueryClient();
  const { data: identity } = useCurrentUserIdentity();

  // The settings cache belongs to the account that loaded it.
  useEffect(
    () =>
      onSessionEnding(() => {
        queryClient.removeQueries({ queryKey: ['user-task-settings'] });
      }),
    [queryClient]
  );

  const { data: settings } = useQuery({
    queryKey: ['user-task-settings'],
    queryFn: async (): Promise<TaskSettingsData> => {
      const res = await fetch(getTaskApiUrl('/api/v1/users/task-settings'), {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) {
        // Return defaults if API fails
        return { task_auto_assign_to_self: false, fade_completed_tasks: false };
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Only fetch if user is logged in
    enabled: Boolean(identity),
  });

  useEffect(() => {
    // Default to false (no fade) until a signed-in user's settings load.
    const enabled =
      Boolean(identity) && settings?.fade_completed_tasks === true;
    document.body.setAttribute('data-fade-completed', String(enabled));
  }, [identity, settings?.fade_completed_tasks]);

  return null;
}
