import { AlertTriangle, CalendarDays, RefreshCw } from '@tuturuuu/icons';
import { useRef, useState } from 'react';
import { Button } from '../../button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover';
import { CalendarConnectionsSettingsContent } from './calendar-connections-settings-content';
import {
  CalendarSyncRecovery,
  isCalendarSyncActive,
  needsCalendarSyncAttention,
} from './calendar-sync-recovery';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

/**
 * Header sync status. While a sync runs or needs attention, the chip opens a
 * popover with the reason and its direct actions (sync, reconnect, pause a
 * failing calendar); full account management stays one step further.
 */
export function CalendarSyncAttentionButton({
  state,
}: {
  state: CalendarConnectionsManagerState;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  // Keeps the chip mounted from opening the popover or account management
  // until focus has returned to it and moved on, even if sync recovers
  // meanwhile, so closing an overlay always has a focus target.
  const [holdChip, setHoldChip] = useState(false);
  const overlayOpen = useRef({ popover: false, manager: false });
  // Opening account management closes the popover; focus then belongs to the
  // dialog, not the chip.
  const openingManager = useRef(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const focusChip = (event: Event) => {
    event.preventDefault();
    chipRef.current?.focus();
  };
  const syncing = isCalendarSyncActive(state);
  const needsAttention = needsCalendarSyncAttention(state);
  const label = state.t(
    needsAttention
      ? 'sync_recovery.attention'
      : syncing
        ? 'syncing_calendars'
        : 'manage_calendar_accounts'
  );

  const changePopover = (open: boolean) => {
    overlayOpen.current.popover = open;
    if (open) setHoldChip(true);
    setPopoverOpen(open);
  };
  const changeManager = (open: boolean) => {
    overlayOpen.current.manager = open;
    if (open) setHoldChip(true);
    setManagerOpen(open);
  };
  const openManager = () => {
    openingManager.current = true;
    changePopover(false);
    changeManager(true);
  };
  const releaseChipUnlessOverlay = () => {
    const { popover, manager } = overlayOpen.current;
    if (!popover && !manager) setHoldChip(false);
  };

  return (
    <>
      <span role="status" className="sr-only">
        {needsAttention
          ? state.t('sync_recovery.attention')
          : syncing
            ? state.t('syncing_calendars')
            : ''}
      </span>
      {(popoverOpen || holdChip || syncing || needsAttention) && (
        <Popover open={popoverOpen} onOpenChange={changePopover}>
          <PopoverTrigger asChild>
            <Button
              ref={chipRef}
              onBlur={releaseChipUnlessOverlay}
              variant="outline"
              size="sm"
              aria-label={label}
              className={
                needsAttention
                  ? 'gap-1.5 border-dynamic-orange/40 text-dynamic-orange @max-3xl/toolbar:w-8 @max-3xl/toolbar:px-0'
                  : 'gap-1.5 text-muted-foreground @max-3xl/toolbar:w-8 @max-3xl/toolbar:px-0'
              }
            >
              {syncing && !needsAttention ? (
                <RefreshCw className="size-4 shrink-0 animate-spin" />
              ) : needsAttention ? (
                <AlertTriangle className="size-4 shrink-0" />
              ) : (
                <CalendarDays className="size-4 shrink-0" />
              )}
              <span className="@max-3xl/toolbar:hidden">{label}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            aria-label={label}
            onCloseAutoFocus={(event) => {
              if (openingManager.current) {
                openingManager.current = false;
                event.preventDefault();
                return;
              }
              // An outside click on a non-focusable surface would leave focus
              // on the page body; keep it on the chip instead. Focus that moved
              // to another control releases the chip.
              requestAnimationFrame(() => {
                if (document.activeElement === document.body)
                  chipRef.current?.focus();
                else if (document.activeElement !== chipRef.current)
                  releaseChipUnlessOverlay();
              });
            }}
            align="end"
            className="max-h-[70dvh] w-[min(22rem,calc(100vw-2rem))] space-y-3 overflow-y-auto p-3"
          >
            <CalendarSyncRecovery state={state} />
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={openManager}
            >
              <CalendarDays className="size-4" />
              {state.t('manage_calendar_accounts')}
            </Button>
          </PopoverContent>
        </Popover>
      )}
      <Dialog open={managerOpen} onOpenChange={changeManager}>
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"
          onCloseAutoFocus={focusChip}
        >
          <DialogHeader>
            <DialogTitle>{state.t('manage_calendar_accounts')}</DialogTitle>
            <DialogDescription>
              {state.t('manage_calendar_accounts_desc')}
            </DialogDescription>
          </DialogHeader>
          <CalendarConnectionsSettingsContent state={state} />
        </DialogContent>
      </Dialog>
    </>
  );
}
