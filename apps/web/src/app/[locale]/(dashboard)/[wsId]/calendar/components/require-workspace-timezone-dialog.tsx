'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Clock } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { detectLocaleFirstDay } from '@/lib/calendar-settings-resolver';

function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function getSupportedTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}

export interface RequireWorkspaceTimezoneDialogProps {
  wsId: string;
  onCompleted: () => void;
}

export function RequireWorkspaceTimezoneDialog({
  wsId,
  onCompleted,
}: RequireWorkspaceTimezoneDialogProps) {
  const t = useTranslations('calendar');
  const router = useRouter();

  const browserTimezone = useMemo(() => detectBrowserTimezone(), []);
  const timezones = useMemo(() => getSupportedTimezones(), []);

  const settingsQuery = useQuery({
    queryKey: ['workspace-calendar-settings', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${wsId}/calendar-settings`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const message =
          typeof json?.error === 'string'
            ? json.error
            : 'Failed to fetch calendar settings';
        throw new Error(message);
      }
      return res.json() as Promise<{
        timezone: string;
        first_day_of_week: 'auto' | 'sunday' | 'monday' | 'saturday';
      }>;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const recommendedFirstDay = useMemo(() => detectLocaleFirstDay(), []);

  const [selectedTimezone, setSelectedTimezone] = useState<string>(() => {
    if (timezones.includes(browserTimezone)) return browserTimezone;
    return 'UTC';
  });

  const [selectedFirstDay, setSelectedFirstDay] = useState<
    'sunday' | 'monday' | 'saturday'
  >(() => {
    const d = recommendedFirstDay;
    return d === 'sunday' || d === 'saturday' ? d : 'monday';
  });

  const saveTimezone = useMutation({
    mutationFn: async (data: {
      timezone: string;
      first_day_of_week: 'sunday' | 'monday' | 'saturday';
    }) => {
      const res = await fetch(`/api/v1/workspaces/${wsId}/calendar-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          typeof json?.error === 'string'
            ? json.error
            : 'Failed to update workspace timezone';
        throw new Error(message);
      }
      return json;
    },
    onSuccess: () => {
      toast.success(t('timezone_required.saved'));
      settingsQuery.refetch();
      router.refresh();
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t('timezone_required.save_failed')
      );
    },
  });

  const currentTimezone = settingsQuery.data?.timezone;
  const currentFirstDay = settingsQuery.data?.first_day_of_week;

  const needsGate =
    !currentTimezone ||
    currentTimezone === 'auto' ||
    !currentFirstDay ||
    currentFirstDay === 'auto';

  // Keep local selects in sync with server values once fetched.
  useEffect(() => {
    if (!settingsQuery.data) return;
    if (!needsGate) return;

    if (currentTimezone && currentTimezone !== 'auto') {
      setSelectedTimezone(currentTimezone);
    }
    if (currentFirstDay && currentFirstDay !== 'auto') {
      setSelectedFirstDay(currentFirstDay);
    }
  }, [settingsQuery.data, needsGate, currentTimezone, currentFirstDay]);

  // Notify parent when gate is satisfied.
  useEffect(() => {
    if (settingsQuery.isFetching) return;
    if (!needsGate) onCompleted();
  }, [needsGate, settingsQuery.isFetching, onCompleted]);

  // Don't render anything until we've fetched the settings
  // This prevents the flash of the dialog when settings are already configured
  if (settingsQuery.isLoading || settingsQuery.isFetching) return null;

  if (!needsGate) return null;

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-dynamic-blue" />
            {t('timezone_required.title')}
          </DialogTitle>
          <DialogDescription>
            {t('timezone_required.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Label htmlFor="workspace-timezone-required">
            {t('timezone_required.label')}
          </Label>
          <Select
            value={selectedTimezone}
            onValueChange={setSelectedTimezone}
            disabled={saveTimezone.isPending || settingsQuery.isFetching}
          >
            <SelectTrigger id="workspace-timezone-required" className="w-full">
              <SelectValue placeholder={browserTimezone} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={browserTimezone}>
                {t('timezone_required.recommended')} ({browserTimezone})
              </SelectItem>
              {browserTimezone !== 'UTC' && (
                <SelectItem value="UTC">UTC</SelectItem>
              )}
              {timezones.map((tz) =>
                tz === browserTimezone || tz === 'UTC' ? null : (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>

          <div className="space-y-2">
            <Label htmlFor="workspace-first-day-required">
              {t('timezone_required.first_day_label')}
            </Label>
            <Select
              value={selectedFirstDay}
              onValueChange={(v) =>
                setSelectedFirstDay(v as 'sunday' | 'monday' | 'saturday')
              }
              disabled={saveTimezone.isPending || settingsQuery.isFetching}
            >
              <SelectTrigger
                id="workspace-first-day-required"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={recommendedFirstDay}>
                  {t('timezone_required.recommended')} (
                  {t(`timezone_required.first_day.${recommendedFirstDay}`)})
                </SelectItem>
                {(['monday', 'sunday', 'saturday'] as const).map((d) =>
                  d === recommendedFirstDay ? null : (
                    <SelectItem key={d} value={d}>
                      {t(`timezone_required.first_day.${d}`)}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() =>
              saveTimezone.mutate({
                timezone: selectedTimezone,
                first_day_of_week: selectedFirstDay,
              })
            }
            disabled={
              saveTimezone.isPending ||
              settingsQuery.isFetching ||
              !selectedTimezone ||
              selectedTimezone === 'auto'
            }
          >
            {saveTimezone.isPending
              ? t('timezone_required.saving')
              : t('timezone_required.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
