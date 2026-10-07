import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withMailApiBaseUrl,
} from './client';

export type ConnectedMailAccount = {
  id: string;
  address: string;
  provider: 'google' | 'microsoft';
};
export type ConnectedMailMessage = {
  id: string;
  subject: string;
  from: string;
  date: string;
  unread: boolean;
  starred: boolean;
  text?: string;
  html?: string;
  to?: string[];
  cc?: string[];
  replyTo?: string[];
  internetMessageId?: string;
  references?: string[];
  bcc?: string[];
  attachments?: {
    id: string;
    filename: string;
    contentType: string;
    size: number;
  }[];
  invitation?: {
    summary: string;
    organizer: string;
    when: string;
    location: string;
    joinUrl: string | null;
  } | null;
};
export type ConnectedMailCompose = {
  requestId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  draftId?: string;
  sourceId?: string;
  mode?: 'reply' | 'reply_all' | 'forward';
  attachmentIds?: string[];
  attachments?: { filename: string; contentType: string; base64: string }[];
};
export function connectedMailPath(wsId: string, segments: string[] = []) {
  return `/api/v1/workspaces/${encodePathSegment(wsId)}/mail/connected${segments.length ? `/${segments.map(encodePathSegment).join('/')}` : ''}`;
}
export function connectedMailRequest<T>(
  wsId: string,
  segments: string[],
  init: {
    method?: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    query?: Record<string, string | undefined>;
  } = {},
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withMailApiBaseUrl(options)).json<T>(
    connectedMailPath(wsId, segments),
    {
      method: init.method ?? 'GET',
      cache: 'no-store',
      credentials: 'include',
      query: init.query,
      ...(init.body !== undefined
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(init.body),
          }
        : {}),
    }
  );
}
