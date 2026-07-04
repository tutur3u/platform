'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  type CalendarSettings,
  CalendarSettingsProvider,
} from './settings-context';

interface CalendarSettingsWrapperProps {
  children: ReactNode;
  initialSettings?: Partial<CalendarSettings>;
  wsId?: string;
}

export function CalendarSettingsWrapper({
  children,
  initialSettings,
  wsId,
}: CalendarSettingsWrapperProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const handleSave = async (settings: CalendarSettings) => {
    if (!wsId) return;

    try {
      const res = await fetch(`/api/v1/workspaces/${wsId}/calendar-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          energy_profile: settings.smartScheduling.energyProfile,
          scheduling_settings: {
            min_buffer: settings.smartScheduling.minBuffer,
            preferred_buffer: settings.smartScheduling.preferredBuffer,
          },
        }),
      });

      if (!res.ok) throw new Error('Failed to save settings');

      toast.success(t('common.success'), {
        description: t('calendar.settings_updated_success'),
      });

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['workspace', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['workspace-calendar-settings', wsId],
      });
    } catch (_error) {
      toast.error(t('common.error'), {
        description: t('calendar.settings_updated_error'),
      });
    }
  };

  return (
    <CalendarSettingsProvider
      initialSettings={initialSettings}
      wsId={wsId}
      onSave={handleSave}
    >
      {children}
    </CalendarSettingsProvider>
  );
}
