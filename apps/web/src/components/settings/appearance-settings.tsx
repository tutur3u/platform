'use client';

import {
  detectLocaleTimeFormat,
  detectSystemTimezone,
} from '@/lib/calendar-settings-resolver';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export default function AppearanceSettings() {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  // Fetch user calendar settings
  const { data: calendarSettings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['user-calendar-settings'],
    queryFn: async () => {
      const res = await fetch('/api/v1/users/calendar-settings');
      if (!res.ok) throw new Error('Failed to fetch calendar settings');
      return res.json() as Promise<{
        timezone: string;
        first_day_of_week: string;
        time_format: string;
      }>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation for updating user calendar settings
  const updateCalendarSettings = useMutation({
    mutationFn: async (data: {
      timezone?: string;
      first_day_of_week?: string;
      time_format?: string;
    }) => {
      const res = await fetch('/api/v1/users/calendar-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update calendar settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-calendar-settings'] });
      // Also invalidate workspace calendar settings to refresh override badges
      queryClient.invalidateQueries({
        queryKey: ['workspace-calendar-settings'],
      });
      toast.success(t('common.success'), {
        description: 'Calendar settings updated successfully',
      });
    },
    onError: () => {
      toast.error(t('common.error'), {
        description: 'Failed to update calendar settings',
      });
    },
  });

  const handleLocaleChange = async (newLocale: string) => {
    const res = await fetch('/api/v1/infrastructure/languages', {
      method: 'POST',
      body: JSON.stringify({ locale: newLocale }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) {
      startTransition(() => {
        router.refresh();
      });
    }
  };

  const handleTimezoneChange = (timezone: string) => {
    updateCalendarSettings.mutate({ timezone });
  };

  const handleFirstDayChange = (firstDay: string) => {
    updateCalendarSettings.mutate({ first_day_of_week: firstDay });
  };

  const handleTimeFormatChange = (timeFormat: string) => {
    updateCalendarSettings.mutate({ time_format: timeFormat });
  };

  // Get list of available timezones
  const timezones = Intl.supportedValuesOf('timeZone');
  const systemTimezone = detectSystemTimezone();
  const detectedTimeFormat = detectLocaleTimeFormat(locale);

  return (
    <div className="space-y-8">
      <SettingItemTab
        title={t('common.theme')}
        description="Select your preferred theme for the application."
      >
        <RadioGroup
          defaultValue={theme}
          onValueChange={setTheme}
          className="grid grid-cols-3 gap-4"
        >
          <div>
            <RadioGroupItem value="light" id="light" className="peer sr-only" />
            <Label
              htmlFor="light"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              <div className="mb-3 h-20 w-full rounded-md bg-[#ecedef] shadow-sm" />
              {t('common.light')}
            </Label>
          </div>
          <div>
            <RadioGroupItem value="dark" id="dark" className="peer sr-only" />
            <Label
              htmlFor="dark"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              <div className="mb-3 h-20 w-full rounded-md bg-slate-950 shadow-sm" />
              {t('common.dark')}
            </Label>
          </div>
          <div>
            <RadioGroupItem
              value="system"
              id="system"
              className="peer sr-only"
            />
            <Label
              htmlFor="system"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              <div className="mb-3 h-20 w-full rounded-md bg-linear-to-r from-[#ecedef] to-slate-950 shadow-sm" />
              {t('common.system')}
            </Label>
          </div>
        </RadioGroup>
      </SettingItemTab>

      <Separator />

      <SettingItemTab
        title={t('common.language')}
        description={t('settings-account.language-description')}
      >
        <Select
          defaultValue={locale}
          onValueChange={handleLocaleChange}
          disabled={isPending}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t('common.select-language')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="vi">Tiếng Việt</SelectItem>
          </SelectContent>
        </Select>
      </SettingItemTab>

      <Separator />

      <SettingItemTab
        title={t('settings-account.timezone')}
        description={t('settings-account.timezone-description')}
      >
        <Select
          value={calendarSettings?.timezone || 'auto'}
          onValueChange={handleTimezoneChange}
          disabled={isLoadingSettings || updateCalendarSettings.isPending}
        >
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder={t('settings-appearance.auto-detect')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              {t('settings-appearance.auto-detect')} ({systemTimezone})
            </SelectItem>
            {timezones.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingItemTab>

      <Separator />

      <SettingItemTab
        title={t('settings-account.first-day-of-week')}
        description={t('settings-account.first-day-of-week-description')}
      >
        <Select
          value={calendarSettings?.first_day_of_week || 'auto'}
          onValueChange={handleFirstDayChange}
          disabled={isLoadingSettings || updateCalendarSettings.isPending}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t('settings-appearance.auto')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              {t('settings-appearance.auto')}
            </SelectItem>
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
      </SettingItemTab>

      <Separator />

      <SettingItemTab
        title={t('settings-account.time-format')}
        description={t('settings-account.time-format-description')}
      >
        <Select
          value={calendarSettings?.time_format || 'auto'}
          onValueChange={handleTimeFormatChange}
          disabled={isLoadingSettings || updateCalendarSettings.isPending}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t('settings-appearance.auto')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              {t('settings-appearance.auto')} (
              {detectedTimeFormat === '12h' ? '1:30 PM' : '13:30'})
            </SelectItem>
            <SelectItem value="12h">
              {t('settings-appearance.12-hour')} (1:30 PM)
            </SelectItem>
            <SelectItem value="24h">
              {t('settings-appearance.24-hour')} (13:30)
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingItemTab>
    </div>
  );
}
