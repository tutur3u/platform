import type { MailAttachment } from '@tuturuuu/internal-api';

/** An inline image lives in the editor; an attachment lives in the chip strip. */
export type MailMediaKind = 'attachment' | 'inline';

/**
 * One lifecycle per item. `removing` is only reachable from `uploaded`: the
 * item is hidden at once and the server delete is still outstanding.
 */
export type MailMediaStatus =
  | 'failed'
  | 'queued'
  | 'removing'
  | 'uploaded'
  | 'uploading';

export interface MailMediaItem {
  /** Server record once uploaded; kept while `removing` for rollback. */
  attachment: MailAttachment | null;
  /** Stable client id for the whole life of the item, also the editor node id. */
  id: string;
  kind: MailMediaKind;
  name: string;
  /** Local object URL of an inline image, revoked when no longer needed. */
  previewUrl: string | null;
  /** Orders the sequential queue; a retry moves the item to the back. */
  queuedAt: number;
  sizeBytes: number;
  status: MailMediaStatus;
}

export interface MailMediaSummary {
  failed: number;
  queued: number;
  removing: number;
  uploading: number;
}

export type MailMediaAnnouncement =
  | { kind: 'added' | 'failed' | 'removed' | 'restored' | 'uploaded'; name: string }
  | null;

export interface MailMediaSnapshot {
  announcement: MailMediaAnnouncement;
  /** Bumps on every announcement so repeated text is re-read. */
  announcementSeq: number;
  items: MailMediaItem[];
}

export const EMPTY_MEDIA_SNAPSHOT: MailMediaSnapshot = {
  announcement: null,
  announcementSeq: 0,
  items: [],
};

export function summarizeMedia(items: MailMediaItem[]): MailMediaSummary {
  const summary: MailMediaSummary = {
    failed: 0,
    queued: 0,
    removing: 0,
    uploading: 0,
  };
  for (const item of items) {
    if (item.status === 'failed') summary.failed += 1;
    else if (item.status === 'queued') summary.queued += 1;
    else if (item.status === 'removing') summary.removing += 1;
    else if (item.status === 'uploading') summary.uploading += 1;
  }
  return summary;
}

/** Send and close wait until nothing is queued, uploading, failed or removing. */
export function isMediaSettled(summary: MailMediaSummary) {
  return (
    summary.failed + summary.queued + summary.removing + summary.uploading === 0
  );
}

/** Work that must finish before the composer can save-and-close. */
export function isMediaInFlight(summary: MailMediaSummary) {
  return summary.queued + summary.removing + summary.uploading > 0;
}

/** Server-backed attachments that count toward the message. */
export function uploadedAttachments(items: MailMediaItem[]): MailAttachment[] {
  return items.flatMap((item) =>
    item.status === 'uploaded' && item.attachment ? [item.attachment] : []
  );
}

export function mailMediaKind(attachment: MailAttachment): MailMediaKind {
  return attachment.disposition === 'inline' ? 'inline' : 'attachment';
}

export function referencesAttachment(html: string, attachmentId: string) {
  return html.includes(`/attachments/${attachmentId}`);
}

/**
 * Items shown as chips. An uploaded inline image appears in the editor only,
 * unless the body no longer references it (for example the user deleted the
 * image with the keyboard); then it falls back to a chip so it stays removable.
 */
export function visibleMediaChips(
  items: MailMediaItem[],
  bodyHtml: string
): MailMediaItem[] {
  return items.filter((item) => {
    if (item.status === 'removing') return false;
    if (item.kind === 'attachment') return true;
    return (
      item.status === 'uploaded' &&
      item.attachment !== null &&
      !referencesAttachment(bodyHtml, item.attachment.id)
    );
  });
}

export function seedMediaItems(attachments: MailAttachment[]): MailMediaItem[] {
  return attachments.map((attachment, index) => ({
    attachment,
    id: attachment.id,
    kind: mailMediaKind(attachment),
    name: attachment.filename,
    previewUrl: null,
    queuedAt: index,
    sizeBytes: attachment.sizeBytes,
    status: 'uploaded',
  }));
}
