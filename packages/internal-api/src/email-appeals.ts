import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type EmailAppealEntry = {
  email: string;
  reason: 'hard_bounce' | 'soft_bounce_threshold' | 'spam_complaint' | 'manual';
  createdAt: string;
  sourceEvent: string | null;
  status: string | null;
};

export type EmailAppealList = {
  entries: EmailAppealEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export function listWorkspaceEmailAppeals(
  wsId: string,
  query: { search: string; page: number },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<EmailAppealList>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/email-appeals`,
    { query, cache: 'no-store' }
  );
}

export function requestWorkspaceEmailAppeal(
  wsId: string,
  payload: { email: string; reason: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    status: 'sent' | 'waiting_recipient' | 'unavailable' | 'unknown';
  }>(`/api/v1/workspaces/${encodePathSegment(wsId)}/email-appeals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function confirmEmailAppeal(
  token: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    status: 'confirmed' | 'unavailable';
  }>('/api/v1/email-appeals/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, confirm: true }),
  });
}
