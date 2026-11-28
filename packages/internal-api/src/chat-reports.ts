import { getInternalApiClient, type InternalApiClientOptions } from './client';

/** Staff moderation queue for chat and Mira content reports. */
export type ChatReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';
export type ChatReportReviewStatus = Exclude<ChatReportStatus, 'open'>;
export type ChatReportSubjectType = 'user' | 'message' | 'ai_response';
export const CHAT_REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence',
  'impersonation',
  'self_harm',
  'harmful',
  'inaccurate',
  'other',
] as const;
export type ChatReportReason = (typeof CHAT_REPORT_REASONS)[number];

/** Content captured when the report was filed; render it as plain text only. */
export interface ChatReportSnapshot {
  kind?: string | null;
  content?: string | null;
  senderId?: string | null;
  model?: string | null;
  previousUserContent?: string | null;
  messageCreatedAt?: string | null;
}

export interface ChatReport {
  id: string;
  subjectType: ChatReportSubjectType;
  reason: ChatReportReason;
  details: string | null;
  status: ChatReportStatus;
  snapshot: ChatReportSnapshot | null;
  wsId: string | null;
  conversationId: string | null;
  messageId: string | null;
  aiChatId: string | null;
  aiChatMessageId: string | null;
  reporterUserId: string | null;
  reporterName: string | null;
  reportedUserId: string | null;
  reportedName: string | null;
  reviewedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface ChatReportListQuery {
  status?: ChatReportStatus;
  limit?: number;
}

export function listChatReports(
  query: ChatReportListQuery = {},
  options?: InternalApiClientOptions
) {
  const params = new URLSearchParams();
  if (query.status !== undefined) params.set('status', query.status);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  const suffix = params.size ? `?${params}` : '';
  return getInternalApiClient(options).json<{ reports: ChatReport[] }>(
    `/api/v1/chat-reports${suffix}`,
    { method: 'GET', credentials: 'include', cache: 'no-store' }
  );
}

export interface ChatReportReview {
  reportId: string;
  status: ChatReportReviewStatus;
  note?: string;
}

export function reviewChatReport(
  review: ChatReportReview,
  options?: InternalApiClientOptions
) {
  const note = review.note?.trim();
  return getInternalApiClient(options).json<unknown>('/api/v1/chat-reports', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reportId: review.reportId,
      status: review.status,
      ...(note ? { note } : {}),
    }),
    cache: 'no-store',
  });
}
