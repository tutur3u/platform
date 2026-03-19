'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Calendar,
  Clock,
  Layers,
  Loader2,
  User,
} from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import type {
  HoursSettingsData,
  HourType,
  WeekTimeRanges,
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
    label: 'Work Hours',
    description:
      'Set your regular working hours. This helps with scheduling tasks and managing workload.',
    field: 'workHours' as const,
  },
  meeting: {
    type: 'MEETING' as HourType,
    icon: Calendar,
    label: 'Meeting Hours',
    description:
      'Define when you are available for meetings. Others can see this when scheduling.',
    field: 'meetingHours' as const,
  },
  personal: {
    type: 'PERSONAL' as HourType,
    icon: User,
    label: 'Personal Hours',
    description:
      'Block off personal time for breaks, exercise, or personal commitments.',
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
    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousSettings) {
        queryClient.setQueryData(
          ['hour-settings', wsId],
          context.previousSettings
        );
      }
      toast.error(
        err instanceof Error ? err.message : 'Failed to update settings'
      );
    },
    onSuccess: (_, variables) => {
      const typeLabel =
        variables.type.charAt(0) + variables.type.slice(1).toLowerCase();
      toast.success(`${typeLabel} hours updated`);
    },
  });

  const handleHoursChange = (
    type: HourType,
    newHours?: WeekTimeRanges | null
  ) => {
    if (!newHours || !wsId) {
      toast.error('No hours provided');
      return;
    }

    updateMutation.mutate({
      wsId,
      type,
      hours: newHours,
    });
  };

  const getActiveDaysSummary = (hours?: WeekTimeRanges | null): string => {
    if (!hours) return 'No days';

    const days = Object.entries(hours)
      .filter(([_, value]) => value.enabled)
      .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1, 3));

    if (days.length === 7) return 'All days';
    if (days.length === 0) return 'No days';
    if (days.length <= 3) return days.join(', ');
    return `${days.length} days`;
  };

  const getTotalHours = (hours?: WeekTimeRanges | null): string => {
    if (!hours) return '0h';

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
    if (minutes === 0) return `${hours_}h/week`;
    return `${hours_}h ${minutes}m/week`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full rounded-md" />
        <Skeleton className="h-10 w-full max-w-md rounded-md" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <p className="text-destructive">
          {error instanceof Error
            ? error.message
            : 'Failed to load hour settings'}
        </p>
        <button
          type="button"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ['hour-settings', wsId],
            })
          }
          className="mt-4 text-primary text-sm underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md bg-muted/30 p-4">
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="text-muted-foreground text-sm">
            <p>
              Configure your available hours for different activities. These
              settings help the calendar optimize scheduling and provide better
              suggestions.
            </p>
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      >
        <div className="mb-4">
          <TabsList className="grid w-full max-w-xl grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            {(
              Object.keys(HOUR_TYPE_CONFIG) as Array<
                keyof typeof HOUR_TYPE_CONFIG
              >
            ).map((key) => {
              const config = HOUR_TYPE_CONFIG[key];
              const Icon = config.icon;
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="flex items-center gap-1.5"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{config.label}</span>
                  <span className="sm:hidden">
                    {config.label.split(' ')[0]}
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
          const Icon = config.icon;
          const hours = hourSettings?.[config.field];
          const isSaving =
            updateMutation.isPending &&
            updateMutation.variables?.type === config.type;

          return (
            <TabsContent key={key} value={key} className="mt-0">
              <div className="rounded-lg border p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    <div>
                      <h3 className="font-medium">{config.label}</h3>
                      <p className="text-muted-foreground text-xs">
                        {config.description}
                      </p>
                    </div>
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
    </div>
  );
}
