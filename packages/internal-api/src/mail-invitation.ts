import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withMailApiBaseUrl,
} from './client';
import { jsonHeaders, mailboxPath } from './mail-paths';

export type MailCalendarResponse = 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
export type MailInvitation = {
  summary: string;
  organizer: string;
  attendee: string;
  start: string;
  when: string;
  location: string;
  joinUrl: string | null;
  reply: {
    response: MailCalendarResponse;
    status: string;
    retryRequestId?: string;
  } | null;
};
const path = (wsId: string, box: string, message: string) =>
  mailboxPath(wsId, box, `/messages/${encodePathSegment(message)}/invitation`);
export function getMailInvitation(
  wsId: string,
  box: string,
  message: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withMailApiBaseUrl(options)).json<{
    invitation: MailInvitation | null;
  }>(path(wsId, box, message), { cache: 'no-store', credentials: 'include' });
}
export function respondToMailInvitation(
  wsId: string,
  box: string,
  message: string,
  payload: { response: MailCalendarResponse; requestId: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withMailApiBaseUrl(options)).json<{
    status: string;
    response?: MailCalendarResponse;
  }>(path(wsId, box, message), {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: jsonHeaders(),
    cache: 'no-store',
    credentials: 'include',
  });
}
