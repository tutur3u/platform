import type {
  CalendarSourceOption,
  GoogleProviderColorOptions,
  WorkspaceCalendarEventCreatePayload,
} from '@tuturuuu/internal-api';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { MeetingInvitationInput } from '@tuturuuu/types/primitives/meeting-invitations';

export type CalendarEventCreationInput = Omit<CalendarEvent, 'id'> & {
  invitation?: MeetingInvitationInput;
};
export type CalendarEventCreationDraft = Partial<CalendarEventCreationInput> & {
  id?: string;
};

export function canInviteCalendarGuests({
  source,
  capabilities,
  timeZone,
  providerColor,
}: {
  source?: CalendarSourceOption;
  capabilities?: GoogleProviderColorOptions;
  timeZone?: string;
  providerColor?: CalendarEvent['providerColor'];
}) {
  return (
    source?.provider === 'google' &&
    source.writable &&
    Boolean(source.accountEmail && timeZone) &&
    !providerColor &&
    capabilities?.connectionId === source.connectionId &&
    capabilities.providerColorWrites === false
  );
}

export function calendarEventCreatePayload(
  event: CalendarEventCreationInput,
  startAt: string,
  endAt: string
): WorkspaceCalendarEventCreatePayload {
  if (
    event.invitation &&
    (event.source?.provider !== 'google' || event.providerColor)
  ) {
    throw new Error(
      'Invitations require a supported connected Google calendar'
    );
  }
  return {
    title: event.title || '',
    description: event.description || '',
    start_at: startAt,
    end_at: endAt,
    ...(event.providerColor
      ? { providerColor: event.providerColor }
      : { color: event.color || 'BLUE' }),
    location: event.location || '',
    locked: true,
    ...('task_id' in event
      ? { task_id: typeof event.task_id === 'string' ? event.task_id : null }
      : {}),
    source: event.source,
    ...(event.invitation ? { invitation: event.invitation } : {}),
  };
}
