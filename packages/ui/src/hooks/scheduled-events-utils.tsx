import type { WorkspaceScheduledEventWithAttendees } from '@tuturuuu/types/primitives/RSVP';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

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

  if (userAttendee && userAttendee.status === 'declined') {
    return null;
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
    priority: 'medium',
    ws_id: scheduledEvent.ws_id,
    _isScheduledEvent: true,
    _scheduledEventId: scheduledEvent.id,
    _attendeeStatus: userAttendee?.status || 'pending',
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
    if (userAttendee.status === 'declined') {
      return false;
    }
    return ['pending', 'accepted', 'tentative'].includes(userAttendee.status);
  }

  return false;
};
