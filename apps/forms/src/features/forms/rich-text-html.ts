import sanitizeHtml from 'sanitize-html';

export const RICH_TEXT_ALLOWED_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'hr',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'strong',
  'u',
  'ul',
];
export const RICH_TEXT_ALLOWED_ATTR = ['alt', 'href', 'rel', 'src', 'target'];
// DOMPurify's URI allowlist; `data:` is accepted only on images.
export const RICH_TEXT_ALLOWED_SCHEMES = [
  ...sanitizeHtml.defaults.allowedSchemes,
  'callto',
  'cid',
  'ftps',
  'matrix',
  'sms',
  'xmpp',
];
// Dropped with their whole subtree, as DOMPurify does for foreign and
// embedded content, instead of keeping sanitized descendants.
const DROPPED_SUBTREE_TAGS = [
  'embed',
  'iframe',
  'math',
  'noembed',
  'noframes',
  'noscript',
  'object',
  'option',
  'script',
  'style',
  'svg',
  'template',
  'textarea',
  'title',
  'xmp',
];

/**
 * Sanitizes author rich-text HTML with a DOM-free parser so the same allowlist
 * runs in the browser, Node SSR and the Worker SSR/RSC runtime, which has no
 * DOM for DOMPurify.
 */
export function sanitizeFormsRichTextHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: RICH_TEXT_ALLOWED_TAGS,
    allowedAttributes: { '*': [...RICH_TEXT_ALLOWED_ATTR, 'aria-*', 'data-*'] },
    allowedSchemes: RICH_TEXT_ALLOWED_SCHEMES,
    allowedSchemesByTag: { img: [...RICH_TEXT_ALLOWED_SCHEMES, 'data'] },
    nonTextTags: DROPPED_SUBTREE_TAGS,
  });
}
