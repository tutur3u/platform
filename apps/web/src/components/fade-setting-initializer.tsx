'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { useEffect, useState } from 'react';

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
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  // Check if user is logged in
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);
    };
    checkAuth();
  }, []);

  const { data: settings } = useQuery({
    queryKey: ['user-task-settings'],
    queryFn: async (): Promise<TaskSettingsData> => {
      const res = await fetch('/api/v1/users/task-settings');
      if (!res.ok) {
        // Return defaults if API fails
        return { task_auto_assign_to_self: false, fade_completed_tasks: false };
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    // Only fetch if user is logged in
    enabled: isLoggedIn === true,
  });

  useEffect(() => {
    // Default to false (no fade) until settings are loaded
    const enabled = settings?.fade_completed_tasks ?? false;
    document.body.setAttribute('data-fade-completed', String(enabled));
  }, [settings?.fade_completed_tasks]);

  return null;
}
