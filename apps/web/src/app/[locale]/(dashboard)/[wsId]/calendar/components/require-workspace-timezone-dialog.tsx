'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Clock, Loader2, ShieldCheck } from '@tuturuuu/icons';
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
import { Separator } from '@tuturuuu/ui/separator';
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

// Import E2EEStatus type from hooks
import type { E2EEStatus } from '../hooks/use-e2ee';

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

  // Fetch workspace calendar settings
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

  // Fetch E2EE status
  const e2eeQuery = useQuery<E2EEStatus>({
    queryKey: ['workspace-e2ee-status', wsId],
    queryFn: async (): Promise<E2EEStatus> => {
      const res = await fetch(`/api/v1/workspaces/${wsId}/encryption`);
      if (!res.ok) return { status: 'unknown' };

      const data = await res.json();

      // Transform API response to discriminated union
      if (!data.enabled) {
        return {
          status: 'disabled',
          reason: data.reason || 'E2EE not available',
        };
      }

      if (!data.hasKey) {
        return { status: 'no-key' };
      }

      return {
        status: 'enabled',
        createdAt: data.createdAt,
        unencryptedCount: data.unencryptedCount ?? 0,
      };
    },
    staleTime: 0,
    refetchOnMount: 'always',
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

  // Mutation to save timezone settings
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

  // Mutation to enable E2EE
  const enableE2EE = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${wsId}/encryption`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to enable E2EE');
      return res.json();
    },
    onSuccess: () => {
      toast.success(t('e2ee.key_generated'));
      e2eeQuery.refetch();
    },
    onError: () => {
      toast.error(t('e2ee.key_generation_failed'));
    },
  });

  const currentTimezone = settingsQuery.data?.timezone;
  const currentFirstDay = settingsQuery.data?.first_day_of_week;

  // Use type guards to check E2EE status
  const e2eeStatus = e2eeQuery.data;
  const isE2EEAvailable =
    e2eeStatus?.status === 'enabled' || e2eeStatus?.status === 'no-key';
  const hasE2EE = e2eeStatus?.status === 'enabled';

  const needsTimezoneGate =
    !currentTimezone ||
    currentTimezone === 'auto' ||
    !currentFirstDay ||
    currentFirstDay === 'auto';

  const needsE2EEGate = isE2EEAvailable && !hasE2EE;

  const needsGate = needsTimezoneGate || needsE2EEGate;

  // Keep local selects in sync with server values once fetched.
  useEffect(() => {
    if (!settingsQuery.data) return;
    if (!needsTimezoneGate) return;

    if (currentTimezone && currentTimezone !== 'auto') {
      setSelectedTimezone(currentTimezone);
    }
    if (currentFirstDay && currentFirstDay !== 'auto') {
      setSelectedFirstDay(currentFirstDay);
    }
  }, [settingsQuery.data, needsTimezoneGate, currentTimezone, currentFirstDay]);

  // Notify parent when gate is satisfied.
  useEffect(() => {
    if (settingsQuery.isFetching || e2eeQuery.isFetching) return;
    if (!needsGate) onCompleted();
  }, [needsGate, settingsQuery.isFetching, e2eeQuery.isFetching, onCompleted]);

  // Don't render anything until we've fetched the settings
  if (
    settingsQuery.isLoading ||
    settingsQuery.isFetching ||
    e2eeQuery.isLoading
  )
    return null;

  if (!needsGate) return null;

  const isTimezoneComplete =
    selectedTimezone && selectedTimezone !== 'auto' && selectedFirstDay;

  const canComplete = isTimezoneComplete && (isE2EEAvailable ? hasE2EE : true);

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
          {/* Timezone Selection */}
          <div className="space-y-2">
            <Label htmlFor="workspace-timezone-required">
              {t('timezone_required.label')}
            </Label>
            <Select
              value={selectedTimezone}
              onValueChange={setSelectedTimezone}
              disabled={
                saveTimezone.isPending ||
                settingsQuery.isFetching ||
                !needsTimezoneGate
              }
            >
              <SelectTrigger
                id="workspace-timezone-required"
                className="w-full"
              >
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
          </div>

          {/* First Day of Week Selection */}
          <div className="space-y-2">
            <Label htmlFor="workspace-first-day-required">
              {t('timezone_required.first_day_label')}
            </Label>
            <Select
              value={selectedFirstDay}
              onValueChange={(v) =>
                setSelectedFirstDay(v as 'sunday' | 'monday' | 'saturday')
              }
              disabled={
                saveTimezone.isPending ||
                settingsQuery.isFetching ||
                !needsTimezoneGate
              }
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

          {/* E2EE Section - Only shown if E2EE is enabled on server */}
          {isE2EEAvailable && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-dynamic-green" />
                  <Label className="font-medium text-base">
                    {t('e2ee.setup_title')}
                  </Label>
                </div>
                <p className="text-muted-foreground text-sm">
                  {t('e2ee.setup_description')}
                </p>

                {hasE2EE ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dynamic-green/50 bg-dynamic-green/10 p-3">
                    <ShieldCheck className="h-4 w-4 text-dynamic-green" />
                    <span className="font-medium text-dynamic-green text-sm">
                      {t('e2ee.already_enabled')}
                    </span>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => enableE2EE.mutate()}
                    disabled={enableE2EE.isPending}
                    className="w-full border-dynamic-green/50 hover:bg-dynamic-green/10"
                  >
                    {enableE2EE.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('e2ee.enabling')}
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        {t('e2ee.enable_for_workspace')}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              if (needsTimezoneGate) {
                saveTimezone.mutate({
                  timezone: selectedTimezone,
                  first_day_of_week: selectedFirstDay,
                });
              } else {
                onCompleted();
              }
            }}
            disabled={
              saveTimezone.isPending || settingsQuery.isFetching || !canComplete
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
