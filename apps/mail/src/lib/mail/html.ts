import sanitizeHtml from 'sanitize-html';

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
  return sanitizeHtml(value, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'font',
      'center',
    ].filter((tag) => !FORBIDDEN_MAIL_TAGS.includes(tag)),
    allowedAttributes: {
      '*': ['class', 'style', 'title', 'dir', 'lang', 'align'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      font: ['color', 'face', 'size'],
      table: ['width', 'height', 'cellpadding', 'cellspacing', 'border'],
      td: ['colspan', 'rowspan', 'width', 'height', 'valign'],
      th: ['colspan', 'rowspan', 'width', 'height', 'valign'],
    },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https', 'http', 'cid'] },
    allowProtocolRelative: false,
    // Keep email typography and layout, but never permit CSS resource URLs or
    // expressions in messages or signatures.
    allowedStyles: {
      '*': {
        color: [/^#[\da-f]{3,8}$/i, /^[a-z]+$/i, /^rgba?\([\d\s.,%]+\)$/i],
        'background-color': [
          /^#[\da-f]{3,8}$/i,
          /^[a-z]+$/i,
          /^rgba?\([\d\s.,%]+\)$/i,
        ],
        'font-family': [/^[\w\s,"'-]+$/],
        'font-size': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/],
        'font-weight': [/^(?:normal|bold|[1-9]00)$/],
        'font-style': [/^(?:normal|italic|oblique)$/],
        'text-align': [/^(?:left|right|center|justify|start|end)$/],
        'text-decoration': [/^(?:none|underline|line-through)$/],
        'white-space': [/^(?:normal|pre|pre-wrap|pre-line)$/],
        'line-height': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)?$/],
        width: [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/],
        'max-width': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/],
        height: [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/],
      },
    },
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
