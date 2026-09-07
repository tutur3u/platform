import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useEffect, useRef } from 'react';

export function useOpenInitialCalendarEvent({
  events,
  initialEventId,
  onOpen,
}: {
  events: CalendarEvent[];
  initialEventId?: string;
  onOpen: (eventId: string) => void;
}) {
  const openedEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !initialEventId ||
      openedEventIdRef.current === initialEventId ||
      !events.some((event) => event.id === initialEventId)
    ) {
      return;
    }

    onOpen(initialEventId);
    openedEventIdRef.current = initialEventId;
  }, [events, initialEventId, onOpen]);
}
