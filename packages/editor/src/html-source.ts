import type { RichTextFeaturePreset, RichTextStylePolicy } from './types.js';
import { normalizeRichTextImageUrl, normalizeRichTextUrl } from './url.js';

export type HTMLSourceInspection = {
  html: string;
  normalized: boolean;
  unsafe: boolean;
};

const BLOCKED_TAGS = new Set([
  'base',
  'button',
  'embed',
  'form',
  'iframe',
  'input',
  'link',
  'math',
  'meta',
  'object',
  'script',
  'select',
  'style',
  'svg',
  'template',
  'textarea',
]);

const FULL_TAGS = new Set([
  'a',
  'blockquote',
  'br',
  'em',
  'h2',
  'h3',
  'h4',
  'hr',
  'img',
  'li',
  'mark',
  'ol',
  'p',
  's',
  'span',
  'strong',
  'u',
  'ul',
]);

const COMPACT_TAGS = new Set([
  'a',
  'br',
  'em',
  'mark',
  'p',
  's',
  'span',
  'strong',
  'u',
]);

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'center',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'fieldset',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'li',
  'legend',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'search',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

const TAG_ALIASES: Record<string, string> = {
  b: 'strong',
  del: 's',
  i: 'em',
  strike: 's',
};

function replaceTag(element: Element, tag: string): Element {
  const replacement = element.ownerDocument.createElement(tag);
  for (const attribute of Array.from(element.attributes))
    replacement.setAttribute(attribute.name, attribute.value);
  while (element.firstChild) replacement.append(element.firstChild);
  element.replaceWith(replacement);
  return replacement;
}

const approvedValues = (
  options: RichTextStylePolicy['textTones'] | undefined
) => new Set((options ?? []).map(({ value }) => value.trim()));

function inspectStyle(
  element: Element,
  policy: RichTextStylePolicy
): { normalized: boolean; unsafe: boolean } {
  const raw = element.getAttribute('style');
  if (!raw) return { normalized: false, unsafe: false };

  const styles: string[] = [];
  const textTones = approvedValues(policy.textTones);
  const highlights = approvedValues(policy.highlights);
  const alignments = new Set(policy.alignments ?? []);
  let normalized = false;

  for (const declaration of raw.split(';')) {
    const [rawProperty, ...rawValue] = declaration.split(':');
    const property = rawProperty?.trim().toLowerCase();
    const value = rawValue.join(':').trim();
    if (!property && !value) continue;
    if (!property || !value) return { normalized, unsafe: true };

    if (
      property === 'text-align' &&
      ['p', 'h2', 'h3', 'h4'].includes(element.tagName.toLowerCase()) &&
      alignments.has(value as never)
    ) {
      styles.push(`text-align: ${value}`);
      continue;
    }
    if (
      property === 'color' &&
      ['span'].includes(element.tagName.toLowerCase()) &&
      textTones.has(value)
    ) {
      styles.push(`color: ${value}`);
      continue;
    }
    if (
      property === 'background-color' &&
      ['mark', 'span'].includes(element.tagName.toLowerCase()) &&
      highlights.has(value)
    ) {
      styles.push(`background-color: ${value}`);
      continue;
    }
    return { normalized, unsafe: true };
  }

  const next = styles.join('; ');
  if (next !== raw.trim().replace(/;$/u, '')) normalized = true;
  if (next) element.setAttribute('style', next);
  else element.removeAttribute('style');
  return { normalized, unsafe: false };
}

/**
 * Validate and normalize an inert HTML projection before Tiptap parses it.
 * This function never stores HTML; callers must convert its output to JSON.
 */
export function inspectRichTextHTML(
  source: string,
  document: Document,
  options: {
    featurePreset: RichTextFeaturePreset;
    stylePolicy?: RichTextStylePolicy;
  }
): HTMLSourceInspection {
  const parsed = document.implementation.createHTMLDocument('');
  const template = parsed.createElement('template');
  template.innerHTML = source;
  const allowedTags =
    options.featurePreset === 'compact' ? COMPACT_TAGS : FULL_TAGS;
  const policy = options.stylePolicy ?? {};
  let normalized = false;

  const comments: Comment[] = [];
  const commentWalker = parsed.createTreeWalker(
    template.content,
    128 // NodeFilter.SHOW_COMMENT
  );
  while (commentWalker.nextNode())
    comments.push(commentWalker.currentNode as Comment);
  if (comments.length) normalized = true;
  for (const comment of comments) comment.remove();

  const elements = Array.from(template.content.querySelectorAll('*'));
  for (const originalElement of elements) {
    if (!template.content.contains(originalElement)) continue;
    let element = originalElement;
    let tag = element.tagName.toLowerCase();

    if (BLOCKED_TAGS.has(tag))
      return { html: source, normalized, unsafe: true };

    if (
      Array.from(element.attributes).some((attribute) => {
        const name = attribute.name.toLowerCase();
        return name === 'class' || name.startsWith('on');
      })
    )
      return { html: source, normalized, unsafe: true };

    const alias = TAG_ALIASES[tag];
    if (alias) {
      element = replaceTag(element, alias);
      tag = alias;
      normalized = true;
    }

    if (!allowedTags.has(tag)) {
      if (/^h[1-6]$/u.test(tag)) {
        element = replaceTag(element, 'p');
        tag = 'p';
      } else if (BLOCK_TAGS.has(tag)) {
        if (element.hasAttribute('style'))
          return { html: source, normalized, unsafe: true };
        const hasBlockChildren = Array.from(element.children).some((child) =>
          BLOCK_TAGS.has(child.tagName.toLowerCase())
        );
        if (hasBlockChildren) {
          element.replaceWith(...Array.from(element.childNodes));
          normalized = true;
          continue;
        }
        element = replaceTag(element, 'p');
        tag = 'p';
      } else {
        if (element.hasAttribute('style'))
          return { html: source, normalized, unsafe: true };
        element.replaceWith(...Array.from(element.childNodes));
        normalized = true;
        continue;
      }
      normalized = true;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name === 'style') continue;
      if (tag === 'a' && ['href', 'title'].includes(name)) continue;
      if (tag === 'img' && ['alt', 'src', 'title'].includes(name)) continue;
      if (tag === 'ol' && name === 'start') continue;
      element.removeAttribute(attribute.name);
      normalized = true;
    }

    const styleResult = inspectStyle(element, policy);
    if (styleResult.unsafe) return { html: source, normalized, unsafe: true };
    normalized ||= styleResult.normalized;

    if (tag === 'a') {
      const href = normalizeRichTextUrl(element.getAttribute('href'));
      if (href === null) return { html: source, normalized, unsafe: true };
      if (href) element.setAttribute('href', href);
      else {
        element.removeAttribute('href');
        normalized = true;
      }
    }

    if (tag === 'img') {
      const src = normalizeRichTextImageUrl(element.getAttribute('src'));
      if (!src) return { html: source, normalized, unsafe: true };
      element.setAttribute('src', src);
      if (!element.hasAttribute('alt')) {
        element.setAttribute('alt', '');
        normalized = true;
      }
    }

    if (tag === 'ol' && element.hasAttribute('start')) {
      const rawStart = element.getAttribute('start') ?? '';
      const start = Number(rawStart);
      if (Number.isSafeInteger(start)) {
        const normalizedStart = String(start);
        if (normalizedStart !== rawStart) normalized = true;
        element.setAttribute('start', normalizedStart);
      } else {
        element.removeAttribute('start');
        normalized = true;
      }
    }
  }

  const html = template.innerHTML.trim();
  normalized ||= html !== source.trim();
  return { html, normalized, unsafe: false };
}
