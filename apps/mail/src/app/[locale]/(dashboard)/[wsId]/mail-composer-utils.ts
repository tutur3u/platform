import type { MailMailbox } from '@tuturuuu/internal-api';
import type { ComposeInitialDraft } from './mail-composer-types';

export type ComposerWarning =
  | 'empty_message'
  | 'empty_subject'
  | 'missing_attachment';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function textToHtml(value: string) {
  return value
    .split(/\n{2,}/u)
    .map((paragraph) => escapeHtml(paragraph).replaceAll('\n', '<br>'))
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join('');
}

function stripHtml(value: string) {
  return value
    .replaceAll(/<br\s*\/?>/giu, '\n')
    .replaceAll(/<\/p>/giu, '\n')
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll(/\s+\n/gu, '\n')
    .replaceAll(/\n\s+/gu, '\n')
    .replaceAll(/[ \t]+/gu, ' ')
    .trim();
}

function getSignature(mailbox: MailMailbox) {
  const html =
    mailbox.signatureHtml?.trim() ||
    (mailbox.signatureText ? textToHtml(mailbox.signatureText) : '');
  const text = mailbox.signatureText?.trim() || (html ? stripHtml(html) : '');
  return { html, text };
}

function signatureTextFromValues(
  signatureHtml: string | null | undefined,
  signatureText: string | null | undefined
) {
  return signatureHtml?.trim()
    ? stripHtml(signatureHtml)
    : (signatureText?.trim() ?? '');
}

export function buildComposerInitialBody(
  initialDraft: ComposeInitialDraft | null | undefined,
  mailbox: MailMailbox
) {
  const baseHtml = initialDraft?.bodyHtml?.trim() ?? '';
  const signature = getSignature(mailbox);
  if (!signature.html || baseHtml.includes('data-mail-signature="true"')) {
    return {
      html: baseHtml,
      text: initialDraft?.bodyText ?? stripHtml(baseHtml),
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
    text: stripHtml(html).replace(/^--\s*/u, '-- \n'),
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
  let text = stripHtml(withoutSignatureBlock).replace(/^--\s*/u, '');
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
