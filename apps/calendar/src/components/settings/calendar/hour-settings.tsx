'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Calendar, Layers, Loader2, User } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import {
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import {
  DAY_KEYS,
  type HoursSettingsData,
  type HourType,
  type WeekTimeRanges,
} from './hour-settings-shared';
import { HoursOverview } from './hours-overview';
import { TimeRangePicker } from './time-range-picker';

type HoursSettingsProps = {
  wsId: string;
  workspace?: Workspace | null;
};

const HOUR_TYPE_CONFIG = {
  work: {
    type: 'WORK' as HourType,
    icon: Briefcase,
    translationKey: 'work',
    field: 'workHours' as const,
  },
  meeting: {
    type: 'MEETING' as HourType,
    icon: Calendar,
    translationKey: 'meeting',
    field: 'meetingHours' as const,
  },
  personal: {
    type: 'PERSONAL' as HourType,
    icon: User,
    translationKey: 'personal',
    field: 'personalHours' as const,
  },
} as const;

async function fetchHourSettings(wsId: string): Promise<HoursSettingsData> {
  return apiFetch<HoursSettingsData>(
    `/api/v1/workspaces/${wsId}/calendar-hours`,
    {
      cache: 'no-store',
    }
  );
}

async function updateHourSettings(params: {
  wsId: string;
  type: HourType;
  hours: WeekTimeRanges;
}): Promise<void> {
  await apiFetch(`/api/v1/workspaces/${params.wsId}/calendar-hours`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: params.type,
      hours: params.hours,
    }),
  });
}

export function HoursSettings({ wsId }: HoursSettingsProps) {
  const t = useTranslations('calendar_settings');
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    'overview' | 'work' | 'meeting' | 'personal'
  >('overview');

  const {
    data: hourSettings,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['hour-settings', wsId],
    queryFn: () => fetchHourSettings(wsId),
    enabled: !!wsId,
    staleTime: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: updateHourSettings,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: ['hour-settings', wsId],
      });

      const previousSettings = queryClient.getQueryData<HoursSettingsData>([
        'hour-settings',
        wsId,
      ]);

      // Optimistic update
      if (previousSettings) {
        const fieldMap: Record<HourType, keyof HoursSettingsData> = {
          PERSONAL: 'personalHours',
          WORK: 'workHours',
          MEETING: 'meetingHours',
        };

        queryClient.setQueryData<HoursSettingsData>(['hour-settings', wsId], {
          ...previousSettings,
          [fieldMap[variables.type]]: variables.hours,
        });
      }

      return { previousSettings };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousSettings) {
        queryClient.setQueryData(
          ['hour-settings', wsId],
          context.previousSettings
        );
      }
      toast.error(t('hours.update_failed'));
    },
    onSuccess: (_, variables) => {
      const key = variables.type.toLowerCase() as keyof typeof HOUR_TYPE_CONFIG;
      toast.success(
        t('hours.updated', { type: t(`hours.types.${key}.short_label`) })
      );
    },
  });

  const handleHoursChange = (
    type: HourType,
    newHours?: WeekTimeRanges | null
  ) => {
    if (!newHours || !wsId) {
      toast.error(t('hours.no_hours_provided'));
      return;
    }

    updateMutation.mutate({
      wsId,
      type,
      hours: newHours,
    });
  };

  const getActiveDaysSummary = (hours?: WeekTimeRanges | null): string => {
    if (!hours) return t('hours.no_days');

    const days = DAY_KEYS.filter((day) => hours[day]?.enabled).map((day) =>
      t(`days.${day}.short`)
    );

    if (days.length === 7) return t('hours.all_days');
    if (days.length === 0) return t('hours.no_days');
    if (days.length <= 3) return days.join(', ');
    return t('hours.day_count', { count: days.length });
  };

  const getTotalHours = (hours?: WeekTimeRanges | null): string => {
    if (!hours) return t('hours.total_hours', { hours: 0 });

    let totalMinutes = 0;
    Object.values(hours).forEach((day) => {
      if (day.enabled) {
        day.timeBlocks.forEach((block) => {
          const [startH, startM] = block.startTime.split(':').map(Number);
          const [endH, endM] = block.endTime.split(':').map(Number);
          if (
            startH !== undefined &&
            startM !== undefined &&
            endH !== undefined &&
            endM !== undefined
          ) {
            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;
            totalMinutes += endMinutes - startMinutes;
          }
        });
      }
    });

    const hours_ = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) return t('hours.total_hours', { hours: hours_ });
    return t('hours.total_hours_minutes', { hours: hours_, minutes });
  };

  if (isLoading) {
    return (
      <SettingsSectionBlock className="space-y-6">
        <Skeleton className="h-20 w-full rounded-md" />
        <Skeleton className="h-10 w-full max-w-md rounded-md" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </SettingsSectionBlock>
    );
  }

  if (isError) {
    return (
      <SettingsSectionMessage tone="error">
        <p>{error instanceof Error ? error.message : t('hours.load_failed')}</p>
        <button
          type="button"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ['hour-settings', wsId],
            })
          }
          className="mt-3 text-primary text-sm underline hover:no-underline"
        >
          {t('hours.try_again')}
        </button>
      </SettingsSectionMessage>
    );
  }

  return (
    <>
      <SettingsSectionMessage className="py-4">
        {t('hours.info')}
      </SettingsSectionMessage>

      <Tabs
        className="px-4 py-4 md:px-5"
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      >
        <div className="mb-4">
          <TabsList className="grid w-full max-w-xl grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">{t('hours.overview')}</span>
            </TabsTrigger>
            {(
              Object.keys(HOUR_TYPE_CONFIG) as Array<
                keyof typeof HOUR_TYPE_CONFIG
              >
            ).map((key) => {
              const config = HOUR_TYPE_CONFIG[key];
              const Icon = config.icon;
              const label = t(`hours.types.${config.translationKey}.label`);
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="flex items-center gap-1.5"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">
                    {t(`hours.types.${config.translationKey}.short_label`)}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-0">
          <HoursOverview
            workHours={hourSettings?.workHours}
            meetingHours={hourSettings?.meetingHours}
            personalHours={hourSettings?.personalHours}
          />
        </TabsContent>

        {(
          Object.keys(HOUR_TYPE_CONFIG) as Array<keyof typeof HOUR_TYPE_CONFIG>
        ).map((key) => {
          const config = HOUR_TYPE_CONFIG[key];
          const hours = hourSettings?.[config.field];
          const isSaving =
            updateMutation.isPending &&
            updateMutation.variables?.type === config.type;

          return (
            <TabsContent key={key} value={key} className="mt-0">
              <div>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">
                      {t(`hours.types.${config.translationKey}.label`)}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {t(`hours.types.${config.translationKey}.description`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSaving && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <Badge variant="outline" className="font-normal text-xs">
                      {getActiveDaysSummary(hours)}
                    </Badge>
                    <Badge variant="secondary" className="font-normal text-xs">
                      {getTotalHours(hours)}
                    </Badge>
                  </div>
                </div>
                <TimeRangePicker
                  label=""
                  value={hours}
                  onChange={(newHours) =>
                    handleHoursChange(config.type, newHours)
                  }
                  showDaySelector={true}
                  compact={false}
                />
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </>
  );
}
