import { createHash } from 'node:crypto';
import type { calendar_v3 } from '@tuturuuu/google';
import type { ProviderCreateMetadata } from './create-metadata';

/** A failed async Google createRequest needs a new requestId. Retain the same
 * replacement event and use a bounded deterministic chain; lost patch responses
 * recover by reading the retained event instead of creating another meeting. */
export async function recoverFailedGoogleConference(args: {
  calendar: calendar_v3.Calendar;
  calendarId: string;
  event: calendar_v3.Schema$Event;
  metadata: ProviderCreateMetadata | undefined;
  authorize: () => Promise<void>;
}) {
  if (
    args.metadata?.provider !== 'google' ||
    !args.metadata.excludedConferenceHash
  )
    return args.event;
  const request = args.event.conferenceData?.createRequest;
  if (request?.status?.statusCode !== 'failure') return args.event;
  const base = args.metadata.fields.conferenceData?.createRequest.requestId;
  if (!base || !args.event.id || !args.event.etag)
    throw new Error('Fresh Google conference receipt unavailable');
  const retry = (attempt: number) =>
    createHash('sha256').update(`${base}:retry:${attempt}`).digest('hex');
  const ids = [base, retry(1), retry(2)];
  const position = ids.indexOf(request.requestId ?? '');
  if (position < 0 || position === ids.length - 1)
    throw new Error('Fresh Google conference retry budget exhausted');
  const requestBody = {
    conferenceData: {
      createRequest: {
        requestId: ids[position + 1],
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };
  await args.authorize();
  return (
    await args.calendar.events.patch(
      {
        calendarId: args.calendarId,
        eventId: args.event.id,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody,
      },
      { headers: { 'If-Match': args.event.etag } }
    )
  ).data;
}
