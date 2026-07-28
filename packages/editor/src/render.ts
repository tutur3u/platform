import type {
  JSONContent,
  RichTextFeaturePreset,
  RichTextStylePolicy,
} from './types.js';
import { normalizeRichTextImageUrl, normalizeRichTextUrl } from './url.js';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character
  );

export type RichTextRenderOptions = {
  featurePreset?: RichTextFeaturePreset;
  stylePolicy?: RichTextStylePolicy;
};

const allowedValues = (options: RichTextStylePolicy['textTones'] | undefined) =>
  new Set((options ?? []).map(({ value }) => value));

function sanitizeMarks(
  marks: JSONContent['marks'],
  policy: RichTextStylePolicy
): JSONContent['marks'] {
  const textTones = allowedValues(policy.textTones);
  const highlights = allowedValues(policy.highlights);
  const safeMarks: NonNullable<JSONContent['marks']> = [];

  for (const mark of marks ?? []) {
    if (['bold', 'italic', 'strike', 'underline'].includes(mark.type)) {
      safeMarks.push({ type: mark.type });
      continue;
    }
    if (mark.type === 'link') {
      const href = normalizeRichTextUrl(mark.attrs?.href);
      if (href) {
        safeMarks.push({
          attrs: {
            href,
            ...(typeof mark.attrs?.title === 'string' && mark.attrs.title
              ? { title: mark.attrs.title }
              : {}),
          },
          type: 'link',
        });
      }
      continue;
    }
    if (mark.type === 'textStyle') {
      const color = String(mark.attrs?.color ?? '');
      if (color && textTones.has(color))
        safeMarks.push({ attrs: { color }, type: 'textStyle' });
      continue;
    }
    if (mark.type === 'highlight') {
      const color = String(mark.attrs?.color ?? '');
      if (color && highlights.has(color))
        safeMarks.push({ attrs: { color }, type: 'highlight' });
    }
  }

  return safeMarks;
}

function sanitizeNode(
  node: JSONContent,
  preset: RichTextFeaturePreset | 'legacy',
  policy: RichTextStylePolicy
): JSONContent | null {
  if (node.type === 'text') {
    return {
      ...(node.marks?.length
        ? { marks: sanitizeMarks(node.marks, policy) }
        : {}),
      text: String(node.text ?? ''),
      type: 'text',
    };
  }

  if (node.type === 'hardBreak') return { type: 'hardBreak' };
  const children = (node.content ?? [])
    .map((child) => sanitizeNode(child, preset, policy))
    .filter((child): child is JSONContent => Boolean(child));

  if (node.type === 'doc') return { content: children, type: 'doc' };

  const alignments = new Set(policy.alignments ?? []);
  const textAlign = String(node.attrs?.textAlign ?? '');
  const alignmentAttrs =
    textAlign && alignments.has(textAlign as never) ? { textAlign } : undefined;

  if (node.type === 'paragraph')
    return {
      ...(alignmentAttrs ? { attrs: alignmentAttrs } : {}),
      content: children,
      type: 'paragraph',
    };

  if (node.type === 'heading') {
    const level = Number(node.attrs?.level ?? 2);
    const allowed =
      preset === 'full' ? [2, 3, 4] : preset === 'legacy' ? [1, 2, 3] : [];
    return allowed.includes(level)
      ? {
          attrs: { level, ...(alignmentAttrs ?? {}) },
          content: children,
          type: 'heading',
        }
      : {
          ...(alignmentAttrs ? { attrs: alignmentAttrs } : {}),
          content: children,
          type: 'paragraph',
        };
  }

  if (
    preset !== 'compact' &&
    ['blockquote', 'bulletList', 'listItem'].includes(node.type ?? '')
  )
    return { content: children, type: node.type };
  if (preset !== 'compact' && node.type === 'orderedList') {
    const start = Number(node.attrs?.start ?? 1);
    return {
      ...(Number.isSafeInteger(start) && start !== 1
        ? { attrs: { start } }
        : {}),
      content: children,
      type: 'orderedList',
    };
  }
  if (preset !== 'compact' && node.type === 'horizontalRule')
    return { type: 'horizontalRule' };
  if (preset !== 'compact' && node.type === 'image') {
    const src = normalizeRichTextImageUrl(node.attrs?.src);
    if (!src) return null;
    return {
      attrs: {
        alt: String(node.attrs?.alt ?? ''),
        src,
        ...(typeof node.attrs?.title === 'string' && node.attrs.title
          ? { title: node.attrs.title }
          : {}),
      },
      type: 'image',
    };
  }

  if (!children.length) return null;
  const inlineContent: JSONContent[] = [];
  const collectInline = (child: JSONContent) => {
    if (['text', 'hardBreak'].includes(child.type ?? '')) {
      inlineContent.push(child);
      return;
    }
    const nested = child.content ?? [];
    for (const [index, nestedChild] of nested.entries()) {
      collectInline(nestedChild);
      if (
        index < nested.length - 1 &&
        !['text', 'hardBreak'].includes(nestedChild.type ?? '')
      )
        inlineContent.push({ type: 'hardBreak' });
    }
  };
  for (const [index, child] of children.entries()) {
    collectInline(child);
    if (
      index < children.length - 1 &&
      !['text', 'hardBreak'].includes(child.type ?? '')
    )
      inlineContent.push({ type: 'hardBreak' });
  }
  return { content: inlineContent, type: 'paragraph' };
}

export function sanitizeRichTextContent(
  content: JSONContent | null,
  options: RichTextRenderOptions = {}
): JSONContent | null {
  if (!content) return null;
  const sanitized = sanitizeNode(
    content,
    options.featurePreset ?? 'legacy',
    options.stylePolicy ?? {}
  );
  if (!sanitized) return { content: [], type: 'doc' };
  return sanitized.type === 'doc'
    ? sanitized
    : { content: [sanitized], type: 'doc' };
}

function styleAttribute(
  node: JSONContent,
  policy: RichTextStylePolicy
): string {
  const alignment = String(node.attrs?.textAlign ?? '');
  return alignment && (policy.alignments ?? []).includes(alignment as never)
    ? ` style="text-align: ${escapeHtml(alignment)}"`
    : '';
}

type AllowedStyleSets = {
  highlights: Set<string>;
  textTones: Set<string>;
};

function renderNode(
  node: JSONContent,
  policy: RichTextStylePolicy,
  sets: AllowedStyleSets
): string {
  if (node.type === 'text') {
    let children = escapeHtml(node.text ?? '');
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') children = `<strong>${children}</strong>`;
      if (mark.type === 'italic') children = `<em>${children}</em>`;
      if (mark.type === 'underline') children = `<u>${children}</u>`;
      if (mark.type === 'strike') children = `<s>${children}</s>`;
      if (mark.type === 'textStyle') {
        const color = String(mark.attrs?.color ?? '');
        if (sets.textTones.has(color))
          children = `<span style="color: ${escapeHtml(color)}">${children}</span>`;
      }
      if (mark.type === 'highlight') {
        const color = String(mark.attrs?.color ?? '');
        if (sets.highlights.has(color))
          children = `<mark style="background-color: ${escapeHtml(color)}">${children}</mark>`;
      }
      if (mark.type === 'link') {
        const href = normalizeRichTextUrl(mark.attrs?.href);
        if (href) {
          const title =
            typeof mark.attrs?.title === 'string' && mark.attrs.title
              ? ` title="${escapeHtml(mark.attrs.title)}"`
              : '';
          children = `<a href="${escapeHtml(href)}"${title} rel="noopener noreferrer">${children}</a>`;
        }
      }
    }
    return children;
  }
  const children = (node.content ?? [])
    .map((child) => renderNode(child, policy, sets))
    .join('');
  if (node.type === 'doc') return children;
  if (node.type === 'hardBreak') return '<br>';
  if (node.type === 'paragraph')
    return `<p${styleAttribute(node, policy)}>${children}</p>`;
  if (node.type === 'heading') {
    const level = Math.min(4, Math.max(1, Number(node.attrs?.level ?? 2)));
    return `<h${level}${styleAttribute(node, policy)}>${children}</h${level}>`;
  }
  if (node.type === 'blockquote') return `<blockquote>${children}</blockquote>`;
  if (node.type === 'bulletList') return `<ul>${children}</ul>`;
  if (node.type === 'orderedList') {
    const start = Number(node.attrs?.start ?? 1);
    const startAttribute =
      Number.isSafeInteger(start) && start !== 1
        ? ` start="${escapeHtml(String(start))}"`
        : '';
    return `<ol${startAttribute}>${children}</ol>`;
  }
  if (node.type === 'listItem') return `<li>${children}</li>`;
  if (node.type === 'horizontalRule') return '<hr>';
  if (node.type === 'image') {
    const src = normalizeRichTextImageUrl(node.attrs?.src);
    if (!src) return '';
    const title =
      typeof node.attrs?.title === 'string' && node.attrs.title
        ? ` title="${escapeHtml(node.attrs.title)}"`
        : '';
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(String(node.attrs?.alt ?? ''))}"${title}>`;
  }
  return children;
}

/** Server-safe: no DOM, React, or editor runtime required. */
export function renderRichTextToHTML(
  content: JSONContent | null,
  options: RichTextRenderOptions = {}
): string {
  const sanitized = sanitizeRichTextContent(content, options);
  const policy = options.stylePolicy ?? {};
  return sanitized
    ? renderNode(sanitized, policy, {
        highlights: allowedValues(policy.highlights),
        textTones: allowedValues(policy.textTones),
      })
    : '';
}
