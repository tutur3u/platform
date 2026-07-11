export interface ComposeInitialDraft {
  bcc?: string[];
  bodyHtml?: string;
  bodyText?: string;
  cc?: string[];
  inReplyTo?: string | null;
  references?: string[];
  sourceAttachmentIds?: string[];
  sourceMessageId?: string;
  subject?: string;
  to?: string[];
}
