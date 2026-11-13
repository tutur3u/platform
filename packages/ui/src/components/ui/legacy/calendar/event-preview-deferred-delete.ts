'use client';

import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { assertOrdinaryCalendarEvent } from '@tuturuuu/ui/hooks/calendar-event-write-payload';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** How long the "Undo" action stays available before the delete is sent. */
export const EVENT_DELETE_UNDO_MS = 6000;

export type DeferredDeleteLabels = {
  deleted: string;
  undo: string;
  failed: string;
};

type Settlement = 'undo' | 'commit';

/**
 * Deletes an event with an undo window.
 *
 * Calendar deletes are hard deletes that also remove provider copies, release
 * linked tasks and record habit skips, so they cannot be reversed faithfully
 * afterwards. The event is hidden at once and the existing delete path runs
 * only when the toast closes without "Undo". Undo un-hides the original event;
 * nothing reaches the server. A failed delete restores the event and reports
 * the error.
 *
 * The delete path closes any open preview or editor when it finishes, so a
 * commit waits while one is open and runs as soon as both close (or when the
 * calendar unmounts). Leaving the page inside the undo window keeps the event.
 */
export function useDeferredEventDelete(labels: DeferredDeleteLabels) {
  const { deleteEvent, getEvents, isModalOpen, isPreviewOpen } = useCalendar();
  const { patchVisibleEvents } = useCalendarSync();
  const busy = isModalOpen || isPreviewOpen;
  const latest = useRef({ deleteEvent, patchVisibleEvents, labels, busy });
  const waiting = useRef(new Map<string, CalendarEvent>());

  useLayoutEffect(() => {
    latest.current = { deleteEvent, patchVisibleEvents, labels, busy };
  });

  const commit = useCallback(async (event: CalendarEvent) => {
    const current = latest.current;
    try {
      await current.deleteEvent(event.id);
    } catch {
      current.patchVisibleEvents([event]);
      toast.error(current.labels.failed);
    }
  }, []);

  const flush = useCallback(() => {
    const events = [...waiting.current.values()];
    waiting.current.clear();
    for (const event of events) void commit(event);
  }, [commit]);

  useEffect(() => {
    if (!busy) flush();
  }, [busy, flush]);

  useEffect(() => flush, [flush]);

  return useCallback(
    (event: CalendarEvent) => {
      const { labels } = latest.current;
      try {
        assertOrdinaryCalendarEvent(getEvents(), event.id);
      } catch {
        toast.error(labels.failed);
        return;
      }

      patchVisibleEvents([], { removeIds: [event.id] });
      let settled = false;
      const settle = (settlement: Settlement) => {
        if (settled) return;
        settled = true;
        switch (settlement) {
          case 'undo':
            latest.current.patchVisibleEvents([event]);
            return;
          case 'commit':
            if (latest.current.busy) waiting.current.set(event.id, event);
            else void commit(event);
            return;
          default: {
            const exhaustive: never = settlement;
            return exhaustive;
          }
        }
      };

      toast(labels.deleted, {
        duration: EVENT_DELETE_UNDO_MS,
        action: { label: labels.undo, onClick: () => settle('undo') },
        onAutoClose: () => settle('commit'),
        onDismiss: () => settle('commit'),
      });
    },
    [commit, getEvents, patchVisibleEvents]
  );
}
