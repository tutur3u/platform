import type { InternalApiClientOptions } from './client';
import { encodePathSegment, getInternalApiClient } from './client';

export type CalendarInvitationCapabilities = {
  provider: 'google' | 'microsoft';
  connectionId: string;
  calendarId: string;
  invitationCreates: boolean;
};

export async function getCalendarInvitationCapabilities(
  wsId: string,
  source: Pick<CalendarInvitationCapabilities, 'provider' | 'connectionId'>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<CalendarInvitationCapabilities>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/invitation-capabilities`,
    { query: source, cache: 'no-store' }
  );
}
