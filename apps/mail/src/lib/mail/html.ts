import DOMPurify from 'isomorphic-dompurify';

const FORBIDDEN_MAIL_TAGS = [
  'base',
  'button',
  'embed',
  'form',
  'iframe',
  'input',
  'link',
  'meta',
  'object',
  'option',
  'script',
  'select',
  'style',
  'textarea',
];

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function textToHtml(value: string) {
  return escapeHtml(value)
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.replaceAll('\n', '<br />'))
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join('');
}

export function stripHtml(value: string) {
  return value
    .replaceAll(/<br\s*\/?>/giu, '\n')
    .replaceAll(/<\/p>/giu, '\n\n')
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

export function sanitizeMailHtml(value: string) {
  return DOMPurify.sanitize(value, {
    FORBID_TAGS: FORBIDDEN_MAIL_TAGS,
    USE_PROFILES: { html: true },
  });
}

export function createSnippet({
  html,
  text,
}: {
  html?: string | null;
  text?: string | null;
}) {
  const source = text?.trim() || (html ? stripHtml(html) : '');
  return source.length > 180 ? `${source.slice(0, 177)}...` : source;
}
