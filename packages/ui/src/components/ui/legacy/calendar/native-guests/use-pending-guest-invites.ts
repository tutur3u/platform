'use client';

import type { CalendarSourceOption } from '@tuturuuu/internal-api';
import {
  addCalendarEventGuests,
  linkCalendarEventMeeting,
} from '@tuturuuu/internal-api/calendar-guests';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useState } from 'react';
import type { PendingGuest } from './guest-adder';

/**
 * Keeps guests picked for a new Tuturuuu event and invites them as soon as
 * the event is created. A failed invite never undoes the created event.
 */
export function usePendingGuestInvites<
  AddEvent extends (...args: never[]) => Promise<CalendarEvent | undefined>,
>({
  addEvent,
  source,
  display,
  onInviteError,
}: {
  addEvent: AddEvent;
  source?: CalendarSourceOption;
  display: { allDay?: boolean; timeZone?: string };
  onInviteError: () => void;
}) {
  const [guests, setGuests] = useState<PendingGuest[]>([]);
  const [addMeet, setAddMeet] = useState(false);

  const addEventWithGuests = (async (...args: Parameters<AddEvent>) => {
    const saved = await addEvent(...args);
    if (
      saved?.id &&
      saved.ws_id &&
      (guests.length > 0 || addMeet) &&
      source?.provider === 'tuturuuu'
    ) {
      try {
        // Link the room first so the invitations carry its join link.
        if (addMeet) await linkCalendarEventMeeting(saved.ws_id, saved.id);
        if (guests.length > 0)
          await addCalendarEventGuests(saved.ws_id, saved.id, {
            guests: guests.map((guest) => guest.input),
            notify: true,
            display,
          });
        setGuests([]);
        setAddMeet(false);
      } catch {
        onInviteError();
      }
    }
    return saved;
  }) as AddEvent;

  return { guests, setGuests, addMeet, setAddMeet, addEventWithGuests };
}
