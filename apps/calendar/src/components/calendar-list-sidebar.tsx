'use client';

import { RefreshCw, Settings } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { CalendarConnectionsSettingsContent } from '@tuturuuu/ui/calendar-app/components/calendar-connections-settings-content';
import { useCalendarConnectionsManager } from '@tuturuuu/ui/calendar-app/components/calendar-connections-unified';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { CalendarToggleRow } from './calendar-toggle-row';

export function CalendarListSidebar({ wsId }: { wsId: string }) {
  const t = useTranslations('calendar-sidebar');
  const state = useCalendarConnectionsManager(wsId);

  return (
    <section className="flex min-h-0 flex-1 flex-col px-3 pb-3">
      <Separator className="my-3" />
      <div className="flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="font-semibold text-sm">{t('visible_calendars')}</h2>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {t('visible_calendars_description', {
              count: state.enabledCount,
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            aria-label={t('sync_calendars')}
            className="h-7 w-7 rounded-full"
            disabled={state.manualSyncDisabled}
            onClick={() => state.syncMutation.mutate()}
            size="icon"
            variant="ghost"
          >
            <RefreshCw
              className={
                state.syncMutation.isPending || state.isSyncing
                  ? 'h-3.5 w-3.5 animate-spin'
                  : 'h-3.5 w-3.5'
              }
            />
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button
                aria-label={t('manage_calendars')}
                className="h-7 w-7 rounded-full"
                size="icon"
                variant="ghost"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{t('manage_calendars')}</DialogTitle>
                <DialogDescription>
                  {t('manage_calendars_description')}
                </DialogDescription>
              </DialogHeader>
              <CalendarConnectionsSettingsContent state={state} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="scrollbar-none mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
        {state.isLoadingCalendars ? (
          <CalendarListSkeleton />
        ) : (
          <>
            {state.workspaceCalendars.length > 0 ? (
              <div>
                <p className="mb-1 px-1.5 font-medium text-muted-foreground text-xs">
                  {t('tuturuuu_calendars')}
                </p>
                {state.workspaceCalendars.map((calendar) => (
                  <CalendarToggleRow
                    checked={calendar.is_enabled}
                    color={state.getCalendarColor(calendar.color || 'BLUE')}
                    disabled={state.togglingTuturuuuIds.has(calendar.id)}
                    key={calendar.id}
                    label={calendar.name}
                    locked={calendar.is_system}
                    onToggle={() =>
                      state.toggleWorkspaceCalendarMutation.mutate({
                        id: calendar.id,
                        is_enabled: !calendar.is_enabled,
                      })
                    }
                  />
                ))}
              </div>
            ) : null}

            {state.accounts.map((account) => {
              const calendars = state.calendarsByAccount[account.id] || [];
              if (calendars.length === 0) return null;

              return (
                <div key={account.id}>
                  <p className="mb-1 truncate px-1.5 font-medium text-muted-foreground text-xs">
                    {account.account_email || account.account_name}
                  </p>
                  {calendars.map((calendar) => (
                    <CalendarToggleRow
                      checked={calendar.is_enabled}
                      color={state.getCalendarColor(calendar.color || 'BLUE')}
                      disabled={state.togglingIds.has(calendar.id)}
                      key={calendar.id}
                      label={calendar.calendar_name}
                      locked={calendar.accessRole === 'reader'}
                      onToggle={() =>
                        void state.handleToggle(
                          calendar.id,
                          calendar.is_enabled,
                          {
                            accessRole: calendar.accessRole,
                            accountId: calendar.accountId,
                            calendar_id: calendar.calendar_id,
                            calendar_name: calendar.calendar_name,
                            color: calendar.color,
                            connectionExists: calendar.connectionExists,
                          }
                        )
                      }
                    />
                  ))}
                </div>
              );
            })}

            {state.workspaceCalendars.length === 0 &&
            state.accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed p-3 text-center">
                <p className="font-medium text-sm">{t('no_calendars')}</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {t('no_calendars_description')}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function CalendarListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="h-3 w-24 animate-pulse rounded bg-foreground/8" />
      {[0, 1, 2, 3].map((item) => (
        <div className="flex items-center gap-2 py-1" key={item}>
          <div className="h-4 w-4 animate-pulse rounded bg-foreground/8" />
          <div className="h-3 flex-1 animate-pulse rounded bg-foreground/8" />
        </div>
      ))}
    </div>
  );
}
