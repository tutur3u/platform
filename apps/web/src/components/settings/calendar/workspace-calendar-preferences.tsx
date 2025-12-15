'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import {
  detectLocaleFirstDay,
  detectSystemTimezone,
  resolveFirstDayOfWeek,
  resolveTimezone,
} from '../../../lib/calendar-settings-resolver';

type WorkspaceCalendarPreferencesProps = {
  wsId: string;
  workspace?: Workspace | null;
};

export function WorkspaceCalendarPreferences({
  wsId,
  workspace,
}: WorkspaceCalendarPreferencesProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  // Fetch workspace calendar settings
  const { data: calendarSettings, isLoading: isLoadingWorkspace } = useQuery({
    queryKey: ['workspace-calendar-settings', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${wsId}/calendar-settings`);
      if (!res.ok) throw new Error('Failed to fetch calendar settings');
      return res.json() as Promise<{
        timezone: string;
        first_day_of_week: string;
      }>;
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    initialData: workspace
      ? {
          timezone: workspace.timezone || 'auto',
          first_day_of_week: workspace.first_day_of_week || 'auto',
        }
      : undefined,
  });

  // Fetch user calendar settings to show overrides
  const { data: userSettings, isLoading: isLoadingUser } = useQuery({
    queryKey: ['users', 'calendar-settings'],
    queryFn: async () => {
      const res = await fetch('/api/v1/users/calendar-settings');
      if (!res.ok) throw new Error('Failed to fetch user calendar settings');
      return res.json() as Promise<{
        timezone: string;
        first_day_of_week: string;
      }>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation for updating workspace calendar settings
  const updateCalendarSettings = useMutation({
    mutationFn: async (data: {
      timezone?: string;
      first_day_of_week?: string;
    }) => {
      const res = await fetch(`/api/v1/workspaces/${wsId}/calendar-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update calendar settings');
      return res.json();
    },
    onSuccess: () => {
      // Invalidate both workspace and user settings to refresh the UI
      queryClient.invalidateQueries({
        queryKey: ['workspace-calendar-settings', wsId],
      });
      queryClient.invalidateQueries({ queryKey: ['workspace', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['users', 'calendar-settings'],
      });
      toast.success(t('common.success'), {
        description: t('calendar.settings_updated_success'),
      });
    },
    onError: () => {
      toast.error(t('common.error'), {
        description: t('calendar.settings_updated_error'),
      });
    },
  });

  const handleTimezoneChange = (timezone: string) => {
    updateCalendarSettings.mutate({ timezone });
  };

  const handleFirstDayChange = (firstDay: string) => {
    updateCalendarSettings.mutate({ first_day_of_week: firstDay });
  };

  // Get list of available timezones
  const timezones = Intl.supportedValuesOf('timeZone');
  const systemTimezone = detectSystemTimezone();
  const localeFirstDay = detectLocaleFirstDay();

  const getFirstDayLabel = (day: string) => {
    switch (day) {
      case 'auto':
        return `${t('settings-appearance.auto')} (${t(`settings-appearance.${localeFirstDay}`)})`;
      case 'sunday':
        return t('settings-appearance.sunday');
      case 'monday':
        return t('settings-appearance.monday');
      case 'saturday':
        return t('settings-appearance.saturday');
      default:
        return day;
    }
  };

  // Check if user has overridden workspace settings
  const userHasTimezoneOverride =
    userSettings?.timezone && userSettings.timezone !== 'auto';
  const userHasFirstDayOverride =
    userSettings?.first_day_of_week &&
    userSettings.first_day_of_week !== 'auto';

  // Calculate effective settings using priority system
  const effectiveTimezone = resolveTimezone(
    { timezone: userSettings?.timezone },
    { timezone: calendarSettings?.timezone }
  );

  const effectiveFirstDay = resolveFirstDayOfWeek(
    { first_day_of_week: userSettings?.first_day_of_week },
    { first_day_of_week: calendarSettings?.first_day_of_week }
  );

  const isLoading = isLoadingWorkspace || isLoadingUser;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-pulse rounded-lg bg-muted" />
        <div className="h-20 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="workspace-timezone">
            {t('calendar.workspace_timezone')}
          </Label>
          {userHasTimezoneOverride && (
            <Badge variant="secondary" className="text-xs">
              {t('calendar.overridden_by_settings')}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {t('calendar.workspace_timezone_desc')}
        </p>
        <Select
          value={calendarSettings?.timezone || 'auto'}
          onValueChange={handleTimezoneChange}
          disabled={updateCalendarSettings.isPending}
        >
          <SelectTrigger id="workspace-timezone" className="w-full">
            <SelectValue placeholder={t('settings-appearance.auto-detect')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              {t('settings-appearance.auto-detect')} ({systemTimezone})
            </SelectItem>
            <Separator className="my-1" />
            {timezones.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {userHasTimezoneOverride && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-muted/50 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-muted-foreground text-sm">
              <p>
                {t.rich('calendar.personal_timezone_override_desc', {
                  timezone: userSettings?.timezone,
                  effectiveTimezone,
                  bold: (chunks) => (
                    <span className="font-medium text-foreground">
                      {chunks}
                    </span>
                  ),
                })}
              </p>
            </div>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="workspace-first-day">
            {t('calendar.workspace_first_day')}
          </Label>
          {userHasFirstDayOverride && (
            <Badge variant="secondary" className="text-xs">
              {t('calendar.overridden_by_settings')}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {t('calendar.workspace_first_day_desc')}
        </p>
        <Select
          value={calendarSettings?.first_day_of_week || 'auto'}
          onValueChange={handleFirstDayChange}
          disabled={updateCalendarSettings.isPending}
        >
          <SelectTrigger id="workspace-first-day" className="w-full md:w-75">
            <SelectValue placeholder={t('settings-appearance.auto')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{getFirstDayLabel('auto')}</SelectItem>
            <SelectItem value="sunday">
              {t('settings-appearance.sunday')}
            </SelectItem>
            <SelectItem value="monday">
              {t('settings-appearance.monday')}
            </SelectItem>
            <SelectItem value="saturday">
              {t('settings-appearance.saturday')}
            </SelectItem>
          </SelectContent>
        </Select>
        {userHasFirstDayOverride && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-muted/50 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-muted-foreground text-sm">
              <p>
                {t.rich('calendar.personal_first_day_override_desc', {
                  firstDay: getFirstDayLabel(
                    userSettings?.first_day_of_week || 'auto'
                  ),
                  effectiveFirstDay: getFirstDayLabel(effectiveFirstDay),
                  bold: (chunks) => (
                    <span className="font-medium text-foreground">
                      {chunks}
                    </span>
                  ),
                })}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
