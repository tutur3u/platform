import type { MailMailbox, MailMessageDetail } from '@tuturuuu/internal-api';
import { canSendAsGroup } from '@/lib/mail/groups/policy';
import { splitComposerQuote } from './mail-composer-quote';
import type { ComposeInitialDraft } from './mail-composer-types';

export type ComposerWarning =
  | 'empty_message'
  | 'empty_subject'
  | 'missing_attachment';

export function getSendableMailboxes(mailboxes: MailMailbox[]) {
  return mailboxes.filter(
    (mailbox) =>
      mailbox.status === 'active' &&
      (mailbox.groupPolicy
        ? canSendAsGroup(mailbox.groupPolicy, mailbox.role)
        : ['admin', 'owner', 'sender'].includes(mailbox.role))
  );
}

export function formatMailBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function textToHtml(value: string) {
  return value
    .split(/\n{2,}/u)
    .map((paragraph) => escapeHtml(paragraph).replaceAll('\n', '<br>'))
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join('');
}

export function applyAiDraftToBody(bodyHtml: string, content: string) {
  const { authored, quoted } = splitComposerQuote(bodyHtml);
  bodyHtml = authored;
  const generatedHtml = textToHtml(content.trim());
  const signatureIndex = bodyHtml.search(
    /<div\b[^>]*data-mail-signature=["']true["'][^>]*>/iu
  );
  const quoteIndex = bodyHtml.search(/<blockquote\b/iu);
  const suffixIndexes = [signatureIndex, quoteIndex].filter(
    (index) => index >= 0
  );
  const suffixIndex = suffixIndexes.length ? Math.min(...suffixIndexes) : -1;
  return suffixIndex >= 0
    ? `${generatedHtml}${bodyHtml.slice(suffixIndex)}${quoted}`
    : `${generatedHtml}${quoted}`;
}

export function mailHtmlToText(value: string) {
  const text = value
    .replaceAll(/<br\s*\/?>/giu, '\n')
    .replaceAll(/<\/p>/giu, '\n')
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll(/\s+\n/gu, '\n')
    .replaceAll(/\n\s+/gu, '\n')
    .replaceAll(/[ \t]+/gu, ' ')
    .trim();
  if (typeof DOMParser !== 'undefined')
    return (
      new DOMParser()
        .parseFromString(text, 'text/html')
        .body.textContent?.trim() ?? text
    );
  const entities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
  };
  return text
    .replace(
      /&(amp|lt|gt|quot|apos|#(?:[0-9]+|x[0-9a-f]+));/giu,
      (entity, name: string) => {
        if (!name.startsWith('#')) return entities[name] ?? entity;
        const point =
          name[1]?.toLowerCase() === 'x'
            ? Number.parseInt(name.slice(2), 16)
            : Number.parseInt(name.slice(1), 10);
        return point > 0 &&
          point <= 0x10ffff &&
          !(point >= 0xd800 && point <= 0xdfff)
          ? String.fromCodePoint(point)
          : '\uFFFD';
      }
    )
    .trim();
}

function getSignature(mailbox: MailMailbox) {
  const html =
    mailbox.signatureHtml?.trim() ||
    (mailbox.signatureText ? textToHtml(mailbox.signatureText) : '');
  const text =
    mailbox.signatureText?.trim() || (html ? mailHtmlToText(html) : '');
  return { html, text };
}

function signatureTextFromValues(
  signatureHtml: string | null | undefined,
  signatureText: string | null | undefined
) {
  return signatureHtml?.trim()
    ? mailHtmlToText(signatureHtml)
    : (signatureText?.trim() ?? '');
}

export function buildComposerInitialBody(
  initialDraft: ComposeInitialDraft | null | undefined,
  mailbox: MailMailbox
) {
  const baseHtml =
    initialDraft?.bodyHtml?.trim() ||
    (initialDraft?.bodyText ? textToHtml(initialDraft.bodyText) : '');
  const signature = getSignature(mailbox);
  if (
    initialDraft?.draftId ||
    !signature.html ||
    baseHtml.includes('data-mail-signature="true"')
  ) {
    return {
      html: baseHtml,
      text: initialDraft?.bodyText ?? mailHtmlToText(baseHtml),
    };
  }

  const signatureHtml = `<div data-mail-signature="true"><p>--&nbsp;</p>${signature.html}</div>`;
  const quoteIndex = baseHtml.search(/<blockquote\b/iu);
  const html =
    quoteIndex >= 0
      ? `${baseHtml.slice(0, quoteIndex)}${signatureHtml}${baseHtml.slice(quoteIndex)}`
      : `${baseHtml || '<p><br></p>'}${signatureHtml}`;

  return {
    html,
    text: mailHtmlToText(html).replace(/^--\s*/u, '-- \n'),
  };
}

function authoredText(bodyHtml: string, signatureText: string | null) {
  const withoutQuotes = bodyHtml.replaceAll(
    /<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/giu,
    ''
  );
  const withoutSignatureBlock = withoutQuotes.replaceAll(
    /<div\b[^>]*data-mail-signature=["']true["'][^>]*>[\s\S]*?<\/div>/giu,
    ''
  );
  let text = mailHtmlToText(withoutSignatureBlock).replace(/^--\s*/u, '');
  if (signatureText?.trim()) {
    text = text.replace(signatureText.trim(), '');
  }
  return text.trim();
}

export function getComposerWarnings({
  attachmentCount,
  bodyHtml,
  signatureText,
  signatureHtml,
  subject,
}: {
  attachmentCount: number;
  bodyHtml: string;
  signatureHtml?: string | null;
  signatureText: string | null | undefined;
  subject: string;
}): ComposerWarning[] {
  const warnings: ComposerWarning[] = [];
  const text = authoredText(
    bodyHtml,
    signatureTextFromValues(signatureHtml, signatureText)
  );

  if (!subject.trim()) warnings.push('empty_subject');
  if (!text) warnings.push('empty_message');

  const attachmentLanguage =
    /\b(?:attach|attached|attachment|attachments|enclos(?:e|ed|ure))\b|đính\s+kèm|tệp\s+đính\s+kèm/iu;
  if (attachmentCount === 0 && attachmentLanguage.test(`${subject}\n${text}`)) {
    warnings.push('missing_attachment');
  }

  return warnings;
}

export function toComposeInitialDraft(
  message: MailMessageDetail
): ComposeInitialDraft {
  return {
    draftId: message.id,
    mailboxId: message.mailboxId,
    attachments: message.attachments,
    subject: message.subject === '(no subject)' ? '' : message.subject,
    bodyHtml: message.bodyHtml ?? '',
    bodyText: message.bodyText ?? '',
    to: message.recipients.filter((r) => r.kind === 'to').map((r) => r.address),
    cc: message.recipients.filter((r) => r.kind === 'cc').map((r) => r.address),
    bcc: message.recipients
      .filter((r) => r.kind === 'bcc')
      .map((r) => r.address),
    recipientDisplayNames: Object.fromEntries(
      message.recipients
        .filter((r) => r.displayName)
        .map((r) => [r.address, r.displayName!])
    ),
    inReplyTo: message.inReplyTo,
    references: message.references,
    threadId: message.threadId ?? undefined,
  };
}
