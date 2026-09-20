import { google } from '@tuturuuu/google';
import { createGraphClient } from '@tuturuuu/microsoft';
import type { MeetingResponse } from '@tuturuuu/utils/meeting-invitations';
import { createGoogleAuthClient } from './provider-writes';
import type { ResolvedCalendarSource } from './source-resolver';

export class MeetingResponseError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** Source resolution must be scoped to the signed-in user's connected account. */
export async function respondToProviderMeeting(args: {
  source: ResolvedCalendarSource;
  externalEventId: string;
  response: Exclude<MeetingResponse, 'needsAction'>;
}) {
  const { source, externalEventId, response } = args;
  if (
    source.provider === 'tuturuuu' ||
    !source.accessToken ||
    !source.accountEmail
  ) {
    throw new MeetingResponseError(
      409,
      'Connect the invited calendar account first'
    );
  }
  const email = source.accountEmail.toLowerCase();
  if (source.provider === 'google') {
    const calendar = google.calendar({
      version: 'v3',
      auth: createGoogleAuthClient(source),
    });
    const { data: event } = await calendar.events.get({
      calendarId: source.externalCalendarId,
      eventId: externalEventId,
    });
    const self = event.attendees?.find(
      (guest) => guest.self && guest.email?.toLowerCase() === email
    );
    if (event.status === 'cancelled')
      throw new MeetingResponseError(409, 'This meeting was cancelled');
    if (!self || event.organizer?.self)
      throw new MeetingResponseError(
        403,
        'Only the invited account can respond'
      );
    // attendeesOmitted updates only this participant without dropping other
    // guests, and If-Match rejects a response to a concurrently changed event.
    await calendar.events.patch(
      {
        calendarId: source.externalCalendarId,
        eventId: externalEventId,
        sendUpdates: 'all',
        requestBody: {
          attendeesOmitted: true,
          attendees: [{ email: self.email, responseStatus: response }],
        },
      },
      event.etag ? { headers: { 'If-Match': event.etag } } : undefined
    );
    return;
  }

  const client = createGraphClient(source.accessToken);
  // /me/events binds the operation to this account's mailbox, not a delegated
  // calendar owned by somebody else whose invitation must not be answered.
  const path = `/me/events/${encodeURIComponent(externalEventId)}`;
  const event = await client
    .api(path)
    .header('Prefer', 'IdType="ImmutableId"')
    .select('id,isCancelled,isOrganizer,attendees')
    .get();
  if (event.isCancelled)
    throw new MeetingResponseError(409, 'This meeting was cancelled');
  const invited = event.attendees?.some(
    (guest: { emailAddress?: { address?: string } }) =>
      guest.emailAddress?.address?.toLowerCase() === email
  );
  if (!invited || event.isOrganizer)
    throw new MeetingResponseError(403, 'Only the invited account can respond');
  const action = {
    accepted: 'accept',
    declined: 'decline',
    tentative: 'tentativelyAccept',
  }[response];
  await client
    .api(`${path}/${action}`)
    .header('Prefer', 'IdType="ImmutableId"')
    .post({ sendResponse: true });
}
