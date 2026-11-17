import type { MailAttachment } from '@tuturuuu/internal-api';
import {
  mailAttachmentPreviewType,
  mailAttachmentPreviewUrl,
} from './attachment-preview';

export function normalizeMailContentId(value: string) {
  return value.trim().replace(/^<|>$/gu, '').toLowerCase();
}

export function mailContentIdFromUrl(value: string | undefined) {
  if (!value) return null;
  const reference = value.replace(
    /^\/(?:mail\/)?api\/v1\/workspaces\/[^/]+\/mail\/mailboxes\/[^/]+\/drafts\/[^/]+?(?=cid:)/iu,
    ''
  );
  if (!/^cid:/iu.test(reference)) return null;
  try {
    return normalizeMailContentId(decodeURIComponent(reference.slice(4)));
  } catch {
    return null;
  }
}

export function replaceMailInlineAttachmentUrls(
  html: string,
  attachments: { id: string; contentId?: string | null; disposition?: string }[]
) {
  const byId = new Map(
    attachments
      .filter(
        (attachment) =>
          attachment.disposition === 'inline' && attachment.contentId
      )
      .map((attachment) => [attachment.id, attachment.contentId!])
  );
  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']*)\2/giu,
    (match, prefix: string, quote: string, source: string) => {
      const path = source.replace(/^https?:\/\/[^/]+/iu, '');
      const id = path.match(
        /^\/(?:mail\/)?api\/v1\/workspaces\/[^/]+\/mail\/mailboxes\/[^/]+\/(?:drafts|messages)\/[^/]+\/attachments\/([^/?]+)(?:\?preview=1)?$/u
      )?.[1];
      const contentId = id ? byId.get(id) : undefined;
      return contentId
        ? `${prefix}${quote}cid:${encodeURIComponent(contentId.trim().replace(/^<|>$/gu, ''))}${quote}`
        : match;
    }
  );
}

export function buildMailInlineImages(attachments: MailAttachment[]) {
  return Object.fromEntries(
    attachments.flatMap((attachment) => {
      if (
        !attachment.contentId ||
        !attachment.protectedUrl ||
        mailAttachmentPreviewType(attachment.contentType, attachment.filename)
          ?.kind !== 'image'
      ) {
        return [];
      }
      return [
        [
          normalizeMailContentId(attachment.contentId),
          mailAttachmentPreviewUrl(attachment.protectedUrl),
        ],
      ];
    })
  );
}
