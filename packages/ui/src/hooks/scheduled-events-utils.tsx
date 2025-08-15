import type { WorkspaceScheduledEventWithAttendees } from '@tuturuuu/types/primitives/RSVP';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { isBefore, parseISO } from 'date-fns';

export const convertScheduledEventToCalendarEvent = (
  scheduledEvent: WorkspaceScheduledEventWithAttendees,
  userId: string
): CalendarEvent | null => {
  const userAttendee = scheduledEvent.attendees?.find(
    (a) => a.user_id === userId
  );

  if (!userAttendee && scheduledEvent.creator_id !== userId) {
    return null;
  }

  // For declined events, only hide them after the event has started
  if (userAttendee && userAttendee.status === 'declined') {
    const eventStartTime = parseISO(scheduledEvent.start_at);
    const now = new Date();

    // If the event has already started, hide it
    if (isBefore(eventStartTime, now)) {
      return null;
    }
  }

  const isPending = userAttendee?.status === 'pending';
  const isTentative = userAttendee?.status === 'tentative';

  const calendarEvent: CalendarEvent = {
    id: `scheduled_${scheduledEvent.id}`,
    title: scheduledEvent.title,
    description: scheduledEvent.description || '',
    start_at: scheduledEvent.start_at,
    end_at: scheduledEvent.end_at,
    location: scheduledEvent.location || '',
    color: (scheduledEvent.color as SupportedColor) || 'primary',
    ws_id: scheduledEvent.ws_id,
    _isScheduledEvent: true,
    _scheduledEventId: scheduledEvent.id,
    _attendeeStatus:
      userAttendee?.status ||
      (scheduledEvent.creator_id === userId ? 'accepted' : 'pending'),
    _isPending: isPending,
    _isTentative: isTentative,
    _isCreator: scheduledEvent.creator_id === userId,
    _attendeeCount: scheduledEvent.attendee_count,
  };

  return calendarEvent;
};

export const shouldDisplayScheduledEvent = (
  event: WorkspaceScheduledEventWithAttendees,
  userId: string
): boolean => {
  if (event.creator_id === userId) {
    return true;
  }

  const userAttendee = event.attendees?.find((a) => a.user_id === userId);
  if (userAttendee) {
    // For declined events, only hide them after the event has started
    if (userAttendee.status === 'declined') {
      const eventStartTime = parseISO(event.start_at);
      const now = new Date();

      // If the event has already started, hide it
      return !isBefore(eventStartTime, now);
    }
    return ['pending', 'accepted', 'tentative'].includes(userAttendee.status);
  }

  return false;
};
