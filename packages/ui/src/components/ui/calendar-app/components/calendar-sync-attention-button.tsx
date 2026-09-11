import { AlertTriangle, CalendarDays, RefreshCw } from '@tuturuuu/icons';
import { useState } from 'react';
import { Button } from '../../button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../dialog';
import { CalendarConnectionsSettingsContent } from './calendar-connections-settings-content';
import {
  isCalendarSyncActive,
  needsCalendarSyncAttention,
} from './calendar-sync-recovery';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

/** Keep recovery visible when the sidebar replaces the header calendar picker. */
export function CalendarSyncAttentionButton({
  state,
}: {
  state: CalendarConnectionsManagerState;
}) {
  const [open, setOpen] = useState(false);
  const syncing = isCalendarSyncActive(state);
  const needsAttention = needsCalendarSyncAttention(state);

  return (
    <>
      <span role="status" className="sr-only">
        {needsAttention
          ? state.t('sync_recovery.attention')
          : syncing
            ? state.t('syncing_calendars')
            : ''}
      </span>
      {(open || syncing || needsAttention) && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={
                !needsAttention
                  ? 'gap-1.5 text-muted-foreground'
                  : 'gap-1.5 border-dynamic-orange/40 text-dynamic-orange'
              }
            >
              {syncing && !needsAttention ? (
                <RefreshCw className="size-4 shrink-0 animate-spin" />
              ) : needsAttention ? (
                <AlertTriangle className="size-4 shrink-0" />
              ) : (
                <CalendarDays className="size-4 shrink-0" />
              )}
              <span>
                {state.t(
                  needsAttention
                    ? 'sync_recovery.attention'
                    : syncing
                      ? 'syncing_calendars'
                      : 'manage_calendar_accounts'
                )}
              </span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{state.t('manage_calendar_accounts')}</DialogTitle>
              <DialogDescription>
                {state.t('manage_calendar_accounts_desc')}
              </DialogDescription>
            </DialogHeader>
            <CalendarConnectionsSettingsContent state={state} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
