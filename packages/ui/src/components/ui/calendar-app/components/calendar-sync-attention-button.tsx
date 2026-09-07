import { AlertTriangle } from '@tuturuuu/icons';
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
import { needsCalendarSyncAttention } from './calendar-sync-recovery';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

/** Keep recovery visible when the sidebar replaces the header calendar picker. */
export function CalendarSyncAttentionButton({
  state,
}: {
  state: CalendarConnectionsManagerState;
}) {
  const [open, setOpen] = useState(false);
  if (!open && !needsCalendarSyncAttention(state)) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-dynamic-orange/40 text-dynamic-orange"
        >
          <AlertTriangle className="size-4 shrink-0" />
          {state.t('sync_recovery.attention')}
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
  );
}
