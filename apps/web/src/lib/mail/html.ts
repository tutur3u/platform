const UNSAFE_TAG_PATTERN =
  /<\/?(?:script|iframe|object|embed|base|form|input|button|textarea|select|option|link|meta|style)[^>]*>/giu;
const EVENT_HANDLER_PATTERN =
  /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu;
const JAVASCRIPT_URL_PATTERN =
  /\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/giu;

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
  return value
    .replace(UNSAFE_TAG_PATTERN, '')
    .replace(EVENT_HANDLER_PATTERN, '')
    .replace(JAVASCRIPT_URL_PATTERN, '');
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
