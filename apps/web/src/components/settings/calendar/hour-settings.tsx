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
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useState } from 'react';
import { HoursOverview } from './hours-overview';
import {
  defaultWeekTimeRanges,
  TimeRangePicker,
  type WeekTimeRanges,
} from './time-range-picker';

export type HoursSettingsData = {
  personalHours: WeekTimeRanges;
  workHours: WeekTimeRanges;
  meetingHours: WeekTimeRanges;
};

type HoursSettingsProps = {
  wsId: string;
  workspace?: Workspace | null;
};

type HourType = 'PERSONAL' | 'WORK' | 'MEETING';

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

async function fetchHourSettings(
  workspaceId: string
): Promise<HoursSettingsData> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_calendar_hour_settings')
    .select('*')
    .eq('ws_id', workspaceId);

  if (error) {
    console.error('Error fetching hours:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error('Failed to load hour settings');
  }

  // If no data exists, create default settings
  if (!data || data.length === 0) {
    const makeDefaultData = () => structuredClone(defaultWeekTimeRanges);
    const defaultSettings = [
      {
        type: 'PERSONAL' as const,
        data: JSON.stringify(makeDefaultData()),
        ws_id: workspaceId,
      },
      {
        type: 'WORK' as const,
        data: JSON.stringify(makeDefaultData()),
        ws_id: workspaceId,
      },
      {
        type: 'MEETING' as const,
        data: JSON.stringify(makeDefaultData()),
        ws_id: workspaceId,
      },
    ];

    const { error: insertError } = await supabase
      .from('workspace_calendar_hour_settings')
      .insert(defaultSettings)
      .select();

    if (insertError) {
      console.error('Error creating default settings:', insertError);
      throw new Error('Failed to create default settings');
    }

    return {
      personalHours: structuredClone(defaultWeekTimeRanges),
      workHours: structuredClone(defaultWeekTimeRanges),
      meetingHours: structuredClone(defaultWeekTimeRanges),
    };
  }

  const personalData = safeParse(
    data?.find((h) => h.type === 'PERSONAL')?.data
  );
  const workData = safeParse(data?.find((h) => h.type === 'WORK')?.data);
  const meetingData = safeParse(data?.find((h) => h.type === 'MEETING')?.data);

  return {
    personalHours: isValidWeekTimeRanges(personalData)
      ? personalData
      : structuredClone(defaultWeekTimeRanges),
    workHours: isValidWeekTimeRanges(workData)
      ? workData
      : structuredClone(defaultWeekTimeRanges),
    meetingHours: isValidWeekTimeRanges(meetingData)
      ? meetingData
      : structuredClone(defaultWeekTimeRanges),
  };
}

async function updateHourSettings(params: {
  workspaceId: string;
  type: HourType;
  hours: WeekTimeRanges;
}): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('workspace_calendar_hour_settings')
    .upsert(
      {
        data: JSON.stringify(params.hours),
        type: params.type,
        ws_id: params.workspaceId,
      },
      { onConflict: 'ws_id,type' }
    );

  if (error) {
    console.error(`Error updating ${params.type} hours:`, error);
    throw new Error(`Failed to update ${params.type.toLowerCase()} hours`);
  }
}

export function HoursSettings({ workspace }: HoursSettingsProps) {
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
    queryKey: ['hour-settings', workspace?.id],
    queryFn: () => fetchHourSettings(workspace!.id),
    enabled: !!workspace?.id,
    staleTime: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: updateHourSettings,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: ['hour-settings', workspace?.id],
      });

      const previousSettings = queryClient.getQueryData<HoursSettingsData>([
        'hour-settings',
        workspace?.id,
      ]);

      // Optimistic update
      if (previousSettings) {
        const fieldMap: Record<HourType, keyof HoursSettingsData> = {
          PERSONAL: 'personalHours',
          WORK: 'workHours',
          MEETING: 'meetingHours',
        };

        queryClient.setQueryData<HoursSettingsData>(
          ['hour-settings', workspace?.id],
          {
            ...previousSettings,
            [fieldMap[variables.type]]: variables.hours,
          }
        );
      }

      return { previousSettings };
    },
    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousSettings) {
        queryClient.setQueryData(
          ['hour-settings', workspace?.id],
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
    if (!newHours || !workspace?.id) {
      toast.error('No hours provided');
      return;
    }

    updateMutation.mutate({
      workspaceId: workspace.id,
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
              queryKey: ['hour-settings', workspace?.id],
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

function isValidWeekTimeRanges(obj: unknown): obj is WeekTimeRanges {
  if (!obj || typeof obj !== 'object') return false;
  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  return days.every((day) => {
    const dayObj = (obj as Record<string, unknown>)[day];
    return (
      dayObj &&
      typeof dayObj === 'object' &&
      'enabled' in dayObj &&
      typeof (dayObj as { enabled: unknown }).enabled === 'boolean' &&
      'timeBlocks' in dayObj &&
      Array.isArray((dayObj as { timeBlocks: unknown }).timeBlocks)
    );
  });
}

function safeParse(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }
  return data;
}
