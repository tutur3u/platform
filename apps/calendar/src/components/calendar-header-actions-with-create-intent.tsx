'use client';

import { CalendarHeaderActions } from '@tuturuuu/tasks-ui/calendar/components/calendar-header-actions';
import type { CalendarHeaderActionsProps } from '@tuturuuu/ui/calendar-app/calendar-client-page';
import { useCreateCalendarEvent } from '@tuturuuu/ui/legacy/calendar/calendar-header-new-event';
import { useEffect, useRef } from 'react';
import {
  readCalendarCreateIntent,
  withoutCalendarCreateIntent,
} from './calendar-create-intent';

/**
 * Consumes `?create=event` once: the parameter is removed from the current
 * history entry first (so reloads and Back never reopen it), then the
 * Calendar's own New event action runs. That action opens an unsaved draft
 * with the Calendar's default time and does nothing for read-only viewers.
 */
export function CalendarCreateIntentConsumer({
  creationBlocked = false,
}: Pick<CalendarHeaderActionsProps, 'creationBlocked'>) {
  const { createEvent, disabled } = useCreateCalendarEvent();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const intent = readCalendarCreateIntent(window.location.search);
    if (intent.createEvent && creationBlocked && !disabled) return;
    handled.current = true;
    if (!intent.present) return;

    window.history.replaceState(
      window.history.state,
      '',
      withoutCalendarCreateIntent(window.location.href)
    );
    if (intent.createEvent && !disabled) createEvent();
  }, [createEvent, creationBlocked, disabled]);

  return null;
}

/** Standard header actions plus the one-shot `create=event` entry. */
export function CalendarHeaderActionsWithCreateIntent(
  props: CalendarHeaderActionsProps
) {
  return (
    <>
      <CalendarHeaderActions {...props} />
      <CalendarCreateIntentConsumer creationBlocked={props.creationBlocked} />
    </>
  );
}
