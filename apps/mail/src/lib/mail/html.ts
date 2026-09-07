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

export function sanitizeMailHtml(
  value: string,
  options: {
    isolatedDocument?: boolean;
    inlineImages?: Record<string, string>;
  } = {}
) {
  return sanitizeHtml(value, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'font',
      'center',
      ...(options.isolatedDocument ? ['style'] : []),
    ].filter(
      (tag) =>
        (tag === 'style' && options.isolatedDocument) ||
        !FORBIDDEN_MAIL_TAGS.includes(tag)
    ),
    nonTextTags: [
      'script',
      'textarea',
      'option',
      'title',
      ...(options.isolatedDocument ? [] : ['style']),
    ],
    // Stylesheets are retained ONLY by the sandboxed, CSP-protected reader.
    // Signatures and all other consumers continue to strip them.
    allowVulnerableTags: Boolean(options.isolatedDocument),
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: 'a',
        attribs: {
          ...attributes,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      img: (_tagName, attributes) => {
        const cid = attributes.src?.startsWith('cid:')
          ? attributes.src.slice(4).replace(/^<|>$/g, '')
          : null;
        const source = cid ? options.inlineImages?.[cid] : undefined;
        return {
          tagName: 'img',
          attribs: {
            ...attributes,
            ...(source?.startsWith('/api/v1/workspaces/')
              ? { src: source }
              : {}),
          },
        };
      },
    },
    allowedAttributes: {
      '*': ['class', 'style', 'title', 'dir', 'lang', 'align', 'bgcolor'],
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
    // The isolated reader preserves complete newsletter CSS, including hidden
    // preheaders. Its sandbox and CSP prohibit execution and isolate layout.
    // Other consumers retain the strict inline-style allowlist below.
    allowedStyles: options.isolatedDocument
      ? undefined
      : {
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
            padding: [
              /^[\d.\s]+(?:px|pt|em|rem|%)?(?:\s+[\d.]+(?:px|pt|em|rem|%)?){0,3}$/,
            ],
            margin: [
              /^(?:auto|0|[\d.]+(?:px|pt|em|rem|%))(?:\s+(?:auto|0|[\d.]+(?:px|pt|em|rem|%))){0,3}$/,
            ],
            'padding-top': [/^[\d.]+(?:px|pt|em|rem|%)$/],
            'padding-right': [/^[\d.]+(?:px|pt|em|rem|%)$/],
            'padding-bottom': [/^[\d.]+(?:px|pt|em|rem|%)$/],
            'padding-left': [/^[\d.]+(?:px|pt|em|rem|%)$/],
            border: [
              /^[\d.]+(?:px|pt)\s+(?:solid|dashed|dotted|double)\s+(?:#[\da-f]{3,8}|[a-z]+)$/i,
              /^0$/,
            ],
            'border-radius': [/^[\d.]+(?:px|pt|em|rem|%)$/],
            'border-collapse': [/^(?:collapse|separate)$/],
            'border-spacing': [/^[\d.]+(?:px|pt)(?:\s+[\d.]+(?:px|pt))?$/],
            'vertical-align': [/^(?:top|middle|bottom|baseline)$/],
            display: [
              /^(?:block|inline|inline-block|none|table|table-row|table-cell)$/,
            ],
            'text-transform': [/^(?:none|uppercase|lowercase|capitalize)$/],
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
