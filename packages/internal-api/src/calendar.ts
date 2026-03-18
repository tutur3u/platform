import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { InternalApiClientOptions } from './client';
import { encodePathSegment, getInternalApiClient } from './client';

export interface WorkspaceCalendarEventUpdatePayload {
  locked?: boolean;
}

export async function updateWorkspaceCalendarEvent(
  wsId: string,
  eventId: string,
  payload: WorkspaceCalendarEventUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarEvent>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/events/${encodePathSegment(
      eventId
    )}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}
