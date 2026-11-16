import Image from '@tiptap/extension-image';
import { withAppBase } from '@tuturuuu/start-bridge/app-url';

/** Keep a draft's attachment reference independent of its serving host/base. */
export function rawMailDraftImageSource(source: string) {
  const raw = source.startsWith('/mail/api/')
    ? source.slice('/mail'.length)
    : source;
  return /^\/api\/v1\/workspaces\/[^/]+\/mail\/mailboxes\/[^/]+\/drafts\/[^/]+\/attachments\/[^/?#]+(?:[?#].*)?$/u.test(
    raw
  )
    ? raw
    : source;
}

export const MAIL_IMAGE_WIDTH_PRESETS = [25, 50, 75, 100] as const;

/** Accept a bare pixel count or a percentage; anything else is dropped. */
export function normalizeMailImageWidth(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0)
    return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const candidate = /^(\d+(?:\.\d+)?)px$/u.exec(trimmed)?.[1] ?? trimmed;
  if (!/^\d+(?:\.\d+)?%?$/u.test(candidate)) return null;
  return Number.parseFloat(candidate) > 0 ? candidate : null;
}

/** Inline style that email clients honor alongside the width attribute. */
export function mailImageWidthStyle(width: string | null) {
  if (!width) return null;
  const size = width.endsWith('%') ? width : `${width}px`;
  return `width: ${size}; max-width: 100%; height: auto;`;
}

function mailImageDomAttributes(
  base: Record<string, unknown>,
  attrs: Record<string, unknown>
) {
  const width = normalizeMailImageWidth(attrs.width);
  const style = mailImageWidthStyle(width);
  return {
    ...base,
    ...attrs,
    width,
    ...(style ? { style } : {}),
  } as Record<string, unknown>;
}

function syncMailImage(
  image: HTMLImageElement,
  attributes: Record<string, unknown>
) {
  // ProseMirror owns the class list (selection state) on this element.
  for (const name of image.getAttributeNames())
    if (name !== 'class') image.removeAttribute(name);
  for (const [name, value] of Object.entries(attributes)) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    if (name === 'class')
      image.classList.add(...String(value).split(/\s+/u).filter(Boolean));
    else
      image.setAttribute(
        name,
        name === 'src' ? withAppBase(String(value)) : String(value)
      );
  }
}

export const MailComposerImage = Image.extend({
  addAttributes() {
    const attributes = this.parent?.() ?? {};
    return {
      ...attributes,
      src: {
        ...attributes.src,
        parseHTML: (element: HTMLElement) => {
          const source = element.getAttribute('src');
          return source === null ? null : rawMailDraftImageSource(source);
        },
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          normalizeMailImageWidth(element.getAttribute('width')) ??
          normalizeMailImageWidth(element.style.width),
        renderHTML: (attrs: Record<string, unknown>) => {
          const width = normalizeMailImageWidth(attrs.width);
          const style = mailImageWidthStyle(width);
          return width ? { width, ...(style ? { style } : {}) } : {};
        },
      },
    };
  },
  // A node view changes the displayed DOM only. Image's normal renderHTML
  // serializer keeps the raw src in getHTML(), draft saves and send payloads.
  addNodeView() {
    return ({ node }) => {
      const image = document.createElement('img');
      const render = (attrs: Record<string, unknown>) =>
        syncMailImage(
          image,
          mailImageDomAttributes(this.options.HTMLAttributes, attrs)
        );
      render(node.attrs);
      return {
        dom: image,
        update: (next) => {
          if (next.type !== node.type) return false;
          render(next.attrs);
          return true;
        },
      };
    };
  },
});
