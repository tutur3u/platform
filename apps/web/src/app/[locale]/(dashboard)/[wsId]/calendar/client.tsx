'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck, ShieldPlus } from '@tuturuuu/icons';
import type {
  CalendarConnection,
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { CreateEventButton } from '@tuturuuu/ui/legacy/calendar/create-event-button';
import type { CalendarSettings } from '@tuturuuu/ui/legacy/calendar/settings/settings-context';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  resolveFirstDayOfWeek,
  resolveTimeFormat,
  resolveTimezone,
} from '../../../../../lib/calendar-settings-resolver';
import CalendarConnections from './components/calendar-connections';
import { RequireWorkspaceTimezoneDialog } from './components/require-workspace-timezone-dialog';
import { SmartScheduleButton } from './components/smart-schedule-button';

interface E2EEStatus {
  enabled: boolean;
  hasKey: boolean;
  reason?: string;
  createdAt?: string | null;
  unencryptedCount?: number;
}

export default function CalendarClientPage({
  experimentalGoogleToken,
  calendarConnections,
  workspace,
  enableSmartScheduling,
}: {
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  calendarConnections: CalendarConnection[];
  workspace: Workspace;
  enableSmartScheduling: boolean;
}) {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [calendarGateCompleted, setCalendarGateCompleted] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const needsCalendarGate =
    !calendarGateCompleted &&
    (!workspace.timezone ||
      workspace.timezone === 'auto' ||
      !workspace.first_day_of_week ||
      workspace.first_day_of_week === 'auto');

  // Fetch E2EE status from API
  const {
    data: e2eeStatus,
    isLoading: e2eeLoading,
    refetch: refetchE2eeStatus,
  } = useQuery<E2EEStatus>({
    queryKey: ['workspace-e2ee-status', workspace.id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/encryption`);
      if (!res.ok) return { enabled: false, hasKey: false };
      return res.json();
    },
    staleTime: 30 * 1000, // Reduce from 5min to 30s for fresher data
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Mutation to enable E2EE
  const enableE2EE = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/encryption`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to enable E2EE');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-e2ee-status', workspace.id],
      });
      toast.success(t('e2ee.key_generated'));
    },
    onError: () => {
      toast.error(t('e2ee.key_generation_failed'));
    },
  });

  // Mutation to migrate/encrypt existing events
  const migrateEvents = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${workspace.id}/encryption/migrate`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error('Failed to encrypt events');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-e2ee-status', workspace.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['calendar-events'],
      });
      toast.success(
        t('e2ee.migration_success', { count: data.migratedCount || 0 })
      );
    },
    onError: () => {
      toast.error(t('e2ee.migration_failed'));
    },
  });

  // State for fix progress
  const [fixProgress, setFixProgress] = useState<{
    progress: number;
    current: number;
    total: number;
    message: string;
  } | null>(null);

  // Mutation to fix integrity issues (events marked encrypted but contain plaintext)
  const fixEvents = useMutation({
    mutationFn: async () => {
      setFixProgress({
        progress: 0,
        current: 0,
        total: 0,
        message: 'Starting...',
      });

      const res = await fetch(
        `/api/v1/workspaces/${workspace.id}/encryption/fix`,
        { method: 'POST' }
      );

      if (!res.ok) throw new Error('Failed to fix events');
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let lastResult: unknown = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === 'progress') {
              setFixProgress({
                progress: data.progress,
                current: data.current,
                total: data.total,
                message: data.message,
              });
            } else if (data.type === 'complete') {
              lastResult = data;
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }

      setFixProgress(null);
      return lastResult as {
        success: boolean;
        fixedCount: number;
        errorCount: number;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-e2ee-status', workspace.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['calendar-events'],
      });
      if (data?.fixedCount) {
        toast.success(t('e2ee.fix_success', { count: data.fixedCount }));
      }
      refetchE2eeStatus();
    },
    onError: () => {
      setFixProgress(null);
      toast.error(t('e2ee.fix_failed'));
    },
  });

  // Fetch user calendar settings to resolve effective settings
  const { data: userSettings } = useQuery({
    queryKey: ['user-calendar-settings'],
    queryFn: async () => {
      const res = await fetch('/api/v1/users/calendar-settings');
      if (!res.ok) return null;
      return res.json() as Promise<{
        timezone: string;
        first_day_of_week: string;
        time_format: string;
      }>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Build initial settings using resolved values (user > workspace > auto)
  const initialSettings = useMemo((): Partial<CalendarSettings> => {
    const effectiveFirstDay = resolveFirstDayOfWeek(
      { first_day_of_week: userSettings?.first_day_of_week },
      { first_day_of_week: workspace.first_day_of_week },
      locale
    );

    const effectiveTimezone = resolveTimezone(
      { timezone: userSettings?.timezone },
      { timezone: workspace.timezone }
    );

    const effectiveTimeFormat = resolveTimeFormat(
      { time_format: userSettings?.time_format },
      locale
    );

    return {
      appearance: {
        firstDayOfWeek: effectiveFirstDay,
        showWeekends: true,
        theme: 'system',
        timeFormat: effectiveTimeFormat,
        defaultView: 'week',
        showWeekNumbers: false,
        showDeclinedEvents: false,
        compactView: false,
      },
      timezone: {
        timezone: effectiveTimezone,
        showSecondaryTimezone: false,
      },
    };
  }, [
    userSettings?.first_day_of_week,
    userSettings?.timezone,
    userSettings?.time_format,
    workspace.first_day_of_week,
    workspace.timezone,
    locale,
  ]);

  const hasUnencryptedEvents =
    e2eeStatus?.hasKey && (e2eeStatus?.unencryptedCount ?? 0) > 0;

  const extras = (
    <div className="grid w-full items-center gap-2 md:flex md:w-auto">
      {/* E2EE Loading Badge */}
      {e2eeLoading && (
        <Badge
          variant="outline"
          className="flex items-center gap-1.5 border-muted-foreground/30 bg-muted/50 text-muted-foreground"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="hidden sm:inline">{t('e2ee.checking')}</span>
        </Badge>
      )}

      {/* E2EE Active Badge - All Encrypted (Click to verify) */}
      {!e2eeLoading &&
        e2eeStatus?.enabled &&
        e2eeStatus?.hasKey &&
        !hasUnencryptedEvents && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isVerifying || fixEvents.isPending}
                  onClick={async () => {
                    setIsVerifying(true);
                    try {
                      const res = await fetch(
                        `/api/v1/workspaces/${workspace.id}/encryption/migrate`
                      );
                      const data = await res.json();
                      if (data.verificationStatus === 'verified') {
                        toast.success(t('e2ee.verified'));
                      } else if (
                        data.verificationStatus === 'integrity_issue'
                      ) {
                        // Auto-fix integrity issues
                        setIsVerifying(false);
                        fixEvents.mutate();
                        return;
                      } else {
                        toast.info(data.message);
                      }
                      refetchE2eeStatus();
                    } catch {
                      toast.error(t('e2ee.verification_failed'));
                    } finally {
                      setIsVerifying(false);
                    }
                  }}
                  className={`flex h-auto items-center gap-1.5 px-2 py-1 transition-all ${
                    isVerifying
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : fixEvents.isPending
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'border-green-500/50 bg-green-500/10 text-green-600 hover:bg-green-500/20 dark:text-green-400'
                  }`}
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="hidden text-xs sm:inline">
                        {t('e2ee.verifying')}
                      </span>
                    </>
                  ) : fixEvents.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="hidden text-xs sm:inline">
                        {fixProgress
                          ? `${fixProgress.progress}%`
                          : t('e2ee.fixing')}
                      </span>
                      <span className="text-xs sm:hidden">
                        {fixProgress ? `${fixProgress.progress}%` : '...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span className="hidden text-xs sm:inline">
                        {t('e2ee.enabled')}
                      </span>
                      <span className="text-xs sm:hidden">E2EE</span>
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {isVerifying
                    ? t('e2ee.verifying_tooltip')
                    : fixEvents.isPending
                      ? t('e2ee.fixing_tooltip')
                      : t('e2ee.verify_tooltip')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

      {/* E2EE Warning Badge - Has Unencrypted Events */}
      {!e2eeLoading && hasUnencryptedEvents && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => migrateEvents.mutate()}
                disabled={migrateEvents.isPending}
                className="flex items-center gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
              >
                {migrateEvents.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">
                  {t('e2ee.encrypt_events', {
                    count: e2eeStatus?.unencryptedCount || 0,
                  })}
                </span>
                <span className="sm:hidden">
                  {e2eeStatus?.unencryptedCount}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {t('e2ee.unencrypted_warning', {
                  count: e2eeStatus?.unencryptedCount || 0,
                })}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Enable E2EE Button */}
      {e2eeStatus?.enabled && !e2eeStatus?.hasKey && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => enableE2EE.mutate()}
                disabled={enableE2EE.isPending}
                className="flex items-center gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
              >
                {enableE2EE.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldPlus className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">{t('e2ee.enable')}</span>
                <span className="sm:hidden">E2EE</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('e2ee.enable_tooltip')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <CreateEventButton variant="header" label={t('new-event')} />
      {enableSmartScheduling && <SmartScheduleButton wsId={workspace.id} />}
      {experimentalGoogleToken && (
        <CalendarConnections
          wsId={workspace.id}
          initialConnections={calendarConnections}
          hasGoogleAuth={!!experimentalGoogleToken}
        />
      )}
      {/* {DEV_MODE && <TestEventGeneratorButton wsId={workspace.id} />} */}
      {/* {DEV_MODE && (
        <AutoScheduleComprehensiveDialog wsId={workspace.id}>
          <Button
            variant="default"
            size="sm"
            className="w-full bg-linear-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 md:w-fit"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Auto-Schedule
          </Button>
        </AutoScheduleComprehensiveDialog>
      )} */}
    </div>
  );

  return (
    <>
      {needsCalendarGate && (
        <RequireWorkspaceTimezoneDialog
          wsId={workspace.id}
          onCompleted={() => setCalendarGateCompleted(true)}
        />
      )}
      <SmartCalendar
        t={t}
        locale={locale}
        workspace={workspace}
        useQuery={useQuery}
        useQueryClient={useQueryClient}
        experimentalGoogleToken={
          experimentalGoogleToken?.ws_id === workspace.id
            ? experimentalGoogleToken
            : null
        }
        extras={extras}
        initialSettings={initialSettings}
      />
      {/*{DEV_MODE && <SyncDebugPanel />}*/}
    </>
  );
}
