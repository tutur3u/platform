import sanitizeHtml from 'sanitize-html';

const RICH_TEXT_ALLOWED_TAGS = [
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
const RICH_TEXT_ALLOWED_ATTR = ['alt', 'href', 'rel', 'src', 'target'];

/**
 * Sanitizes author rich-text HTML with a DOM-free parser so the same allowlist
 * runs in the browser, Node SSR and the Worker SSR/RSC runtime, which has no
 * DOM for DOMPurify.
 */
export function sanitizeFormsRichTextHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: RICH_TEXT_ALLOWED_TAGS,
    allowedAttributes: { '*': RICH_TEXT_ALLOWED_ATTR },
    allowedSchemesByTag: {
      img: [...sanitizeHtml.defaults.allowedSchemes, 'data'],
    },
  });
}
