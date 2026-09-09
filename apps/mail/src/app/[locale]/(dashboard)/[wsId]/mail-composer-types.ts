import type { MailAttachment } from '@tuturuuu/internal-api';
export interface ComposeInitialDraft {
  draftId?: string;
  mailboxId?: string;
  attachments?: MailAttachment[];
  bcc?: string[];
  bodyHtml?: string;
  bodyText?: string;
  cc?: string[];
  inReplyTo?: string | null;
  references?: string[];
  recipientDisplayNames?: Record<string, string>;
  sourceAttachmentIds?: string[];
  sourceMessageId?: string;
  subject?: string;
  threadId?: string;
  to?: string[];
}

export type MailComposerSaveState =
  | 'failed'
  | 'idle'
  | 'offline'
  | 'saved'
  | 'saving';
