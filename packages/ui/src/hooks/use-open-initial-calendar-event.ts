import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';

export function useOpenInitialCalendarEvent({
  events,
  initialEventId,
  setActiveEventId,
}: {
  events: CalendarEvent[];
  initialEventId?: string;
  setActiveEventId: Dispatch<SetStateAction<string | null>>;
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

    setActiveEventId(initialEventId);
    openedEventIdRef.current = initialEventId;
  }, [events, initialEventId, setActiveEventId]);
}
