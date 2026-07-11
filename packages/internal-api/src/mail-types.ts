import type { InternalEmail } from '@tuturuuu/types';

export type { InternalEmail };

export type MailMailboxRole = 'admin' | 'owner' | 'sender' | 'viewer';
export type MailMailboxType = 'personal' | 'shared';
export type MailMailboxStatus =
  | 'active'
  | 'archived'
  | 'disabled'
  | 'quarantined';
export type MailProvider = 'cloudflare' | 'ses';
export type MailDeliveryRoute = 'catch_all' | 'exact';

export interface MailProviderLimits {
  maxMessageBytes: number;
  maxRecipients: number;
}

export interface MailDomain {
  canonicalDomainId: string | null;
  catchAllAutoDraftEnabled: boolean;
  catchAllEnabled: boolean;
  catchAllMailboxId: string | null;
  cloudflareAccountId: string | null;
  cloudflareRoutingRuleId: string | null;
  cloudflareZoneId: string | null;
  domain: string;
  id: string;
  inboundProvider: MailProvider;
  outboundProvider: MailProvider;
  status: 'active' | 'disabled' | 'pending' | 'quarantined' | 'verifying';
  verificationState: Record<string, unknown>;
  verifiedAt: string | null;
}

export type UpsertMailDomainPayload = Omit<
  MailDomain,
  | 'canonicalDomainId'
  | 'catchAllAutoDraftEnabled'
  | 'catchAllEnabled'
  | 'catchAllMailboxId'
  | 'id'
  | 'verifiedAt'
> & {
  canonicalDomainId?: string | null;
};

export interface MailMailbox {
  address: string;
  aiInstructions: string;
  autoDraftEnabled: boolean;
  displayName: string;
  domainId: string;
  effectiveOutboundProvider: MailProvider;
  id: string;
  outboundProviderOverride: MailProvider | null;
  providerLimits: MailProviderLimits;
  role: MailMailboxRole;
  senderName: string;
  signatureHtml: string | null;
  signatureText: string | null;
  status: MailMailboxStatus;
  type: MailMailboxType;
  unreadCount: number;
}

export interface MailMailboxSettings {
  aiInstructions: string;
  autoDraftEnabled: boolean;
  outboundProviderOverride: MailProvider | null;
  senderName: string;
  signatureHtml: string | null;
  signatureText: string | null;
}

export type UpdateMailMailboxSettingsPayload = Partial<MailMailboxSettings>;

export interface MailLabel {
  color: string | null;
  id: string;
  kind: 'custom' | 'system';
  mailboxId: string;
  name: string;
  slug: string;
}

export interface MailFolderDefinition {
  id: string;
  kind: 'custom' | 'system';
  mailboxId: string;
  name: string;
  slug: string;
}

export interface MailRecipient {
  address: string;
  displayName: string | null;
  kind: 'bcc' | 'cc' | 'from' | 'reply_to' | 'to';
}

export interface MailAttachment {
  contentId: string | null;
  contentType: string;
  disposition: 'attachment' | 'inline';
  filename: string;
  id: string;
  protectedUrl: string | null;
  sizeBytes: number;
}

export interface MailMessageSummary {
  bodyText: string | null;
  createdAt: string;
  fromAddress: string;
  fromName: string | null;
  hasAttachments: boolean;
  id: string;
  labels: MailLabel[];
  mailboxId: string;
  receivedAt: string | null;
  sentAt: string | null;
  snippet: string | null;
  starred: boolean;
  status: string;
  subject: string;
  threadId: string | null;
  unread: boolean;
}

export interface MailMessageDetail extends MailMessageSummary {
  attachments: MailAttachment[];
  bodyHtml: string | null;
  deliveryRoute: MailDeliveryRoute | null;
  envelopeFrom: string | null;
  envelopeTo: string | null;
  inReplyTo: string | null;
  internetMessageId: string | null;
  observedRecipient: string | null;
  recipients: MailRecipient[];
  references: string[];
  safeHeaders: Record<string, string>;
  sanitizedHtml: string | null;
}

export interface MailThread {
  id: string;
  lastMessageAt: string | null;
  mailboxId: string;
  messageCount: number;
  status: 'active' | 'archived' | 'spam' | 'trash';
  subject: string;
  unreadCount: number;
}

export interface MailThreadSummary extends MailThread {
  hasAttachments: boolean;
  labels: MailLabel[];
  latestMessageId: string | null;
  latestSnippet: string | null;
  participants: Array<{ address: string; displayName: string | null }>;
  starred: boolean;
}

export interface MailThreadDetail {
  messages: MailMessageDetail[];
  thread: MailThread;
}

export interface MailBootstrapResponse {
  labels: MailLabel[];
  mailboxes: MailMailbox[];
  user: { email: string; id: string };
}

export interface ListMailMessagesParams {
  folder?:
    | 'archive'
    | 'drafts'
    | 'inbox'
    | 'sent'
    | 'spam'
    | 'starred'
    | 'trash';
  folderId?: string;
  label?: string;
  page?: number;
  pageSize?: number;
  query?: string;
}

export type ListMailThreadsParams = ListMailMessagesParams;

export interface MailMessagesResponse {
  messages: MailMessageSummary[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface MailThreadsResponse {
  pagination: { page: number; pageSize: number; total: number };
  threads: MailThreadSummary[];
}

export interface CreateMailDraftPayload {
  bcc?: string[];
  bodyHtml?: string | null;
  bodyText?: string | null;
  cc?: string[];
  inReplyTo?: string | null;
  references?: string[];
  subject: string;
  to: string[];
}

export type UpdateMailDraftPayload = Partial<CreateMailDraftPayload>;

export interface SendMailMessagePayload extends CreateMailDraftPayload {
  draftId?: string | null;
}

export interface MailMutationResponse {
  message: MailMessageDetail;
}

export interface UpdateMailMessageStatePayload {
  action:
    | 'archive'
    | 'mark_read'
    | 'mark_unread'
    | 'restore'
    | 'star'
    | 'trash'
    | 'unstar';
}

export type MailBulkAction =
  | UpdateMailMessageStatePayload['action']
  | 'add_label'
  | 'clear_folder'
  | 'move_to_folder'
  | 'remove_label';

export interface BulkUpdateMailPayload {
  action: MailBulkAction;
  folderId?: string;
  labelId?: string;
  messageIds: string[];
}

export interface BulkUpdateMailThreadsPayload {
  action: Exclude<MailBulkAction, 'clear_folder' | 'move_to_folder'>;
  labelId?: string;
  threadIds: string[];
}

export interface CreateMailOrganizationPayload {
  color?: string | null;
  name: string;
}

export interface UpdateMailOrganizationPayload {
  color?: string | null;
  name?: string;
}

export interface MailMailboxMember {
  createdAt: string;
  email: string | null;
  fullName: string | null;
  role: MailMailboxRole;
  userId: string;
}

export interface UpsertMailMailboxMemberPayload {
  role: MailMailboxRole;
  userId: string;
}

export interface MailCatchAllConfiguration {
  autoDraftEnabled: boolean;
  domain: MailDomain;
  eligibleMailboxes: Array<Pick<MailMailbox, 'address' | 'displayName' | 'id'>>;
  enabled: boolean;
  providerActive: boolean | null;
  targetMailboxId: string | null;
}

export interface UpdateMailCatchAllPayload {
  autoDraftEnabled: boolean;
  enabled: boolean;
  targetMailboxId: string | null;
}
