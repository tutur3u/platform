/** Server-only identity. Never include these fields in report/activity DTOs. */
export interface ReportEmailReplyScope {
  ws_id: string;
  report_id: string;
  subject_user_id: string;
  queue_id: string;
  generation: string;
  review_revision: number;
  recipient_email: string;
  delivery_kind: 'send' | 'test';
  reply_domain: string;
  content_sha256: string;
  key_version: number;
}

export interface ReportEmailReplyIdentity extends ReportEmailReplyScope {
  id: string;
  token_digest: string;
  token_ciphertext: string;
  outcome:
    | 'reserved'
    | 'submitting'
    | 'rejected'
    | 'accepted'
    | 'application_sent'
    | 'outcome_unknown';
}

export interface ReportEmailReplyLease {
  queueId: string;
  wsId: string;
  reportId: string;
  subjectUserId: string;
  workerId: string;
  lockedAt: string;
  recipient: string;
  reviewRevision: number;
  deliveryKind: 'send' | 'test';
}

export type ReportEmailReplyRpc = (
  name: string,
  args: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: unknown }>;
