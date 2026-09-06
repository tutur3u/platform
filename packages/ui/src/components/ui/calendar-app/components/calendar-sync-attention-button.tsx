import { AlertTriangle } from '@tuturuuu/icons';
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
  if (!needsCalendarSyncAttention(state)) return null;
  return (
    <Dialog>
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
