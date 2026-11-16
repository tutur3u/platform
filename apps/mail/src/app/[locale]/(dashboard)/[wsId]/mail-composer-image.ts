import Image, { type ImageOptions } from '@tiptap/extension-image';
import { withAppBase } from '@tuturuuu/start-bridge/app-url';
import {
  MAIL_IMAGE_UPLOAD_MARKER,
  newMailImageInstanceId,
} from './mail-composer-image-nodes';
import {
  attachMailImageUploadView,
  type MailImageUploadActions,
  type MailImageUploadLabels,
} from './mail-composer-image-upload-view';
import {
  applyMailImageLayout,
  attachMailImageResize,
  type MailImageResizeController,
  type MailImageResizeLabels,
} from './mail-composer-image-resize';

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

// Client-only attributes: never mirrored onto the <img> or serialized.
const UPLOAD_ATTRIBUTES = [
  'naturalHeight',
  'naturalWidth',
  'uploadId',
  'uploadName',
  'uploadState',
] as const;

function mailImageDomAttributes(
  base: Record<string, unknown>,
  attrs: Record<string, unknown>
) {
  const width = normalizeMailImageWidth(attrs.width);
  const style = mailImageWidthStyle(width);
  const dom: Record<string, unknown> = {
    ...base,
    ...attrs,
    width,
    ...(style ? { style } : {}),
  };
  for (const name of UPLOAD_ATTRIBUTES) delete dom[name];
  return dom;
}

/**
 * Reserve the decoded size of an image that is still uploading, and keep it
 * once uploaded, so swapping the local preview for the server image moves
 * nothing. Images without a known size render at their natural size.
 */
function applyMailImageBox(
  wrapper: HTMLElement,
  image: HTMLImageElement,
  attrs: Record<string, unknown>,
  explicitWidth: boolean
) {
  const width = Number(attrs.naturalWidth);
  const height = Number(attrs.naturalHeight);
  const known = width > 0 && height > 0;
  if (!known && !attrs.uploadState) {
    wrapper.style.aspectRatio = '';
    image.style.height = '';
    image.style.objectFit = '';
    return;
  }
  wrapper.style.aspectRatio = known ? `${width} / ${height}` : '3 / 2';
  if (!explicitWidth)
    wrapper.style.width = known ? `min(${width}px, 100%)` : 'min(12rem, 100%)';
  image.style.width = '100%';
  image.style.height = '100%';
  image.style.objectFit = 'cover';
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

interface MailComposerImageOptions extends ImageOptions {
  /** Translated slider labels for the drag handles. */
  resizeLabels: () => MailImageResizeLabels;
  /** Retry and Remove for an upload placeholder. */
  uploadActions: () => MailImageUploadActions;
  /** Translated copy for the upload placeholder. */
  uploadLabels: () => MailImageUploadLabels;
}

export const MailComposerImage = Image.extend<MailComposerImageOptions>({
  addOptions() {
    return {
      ...(this.parent?.() as ImageOptions),
      resizeLabels: () => ({
        label: 'Resize image',
        value: (width) => `${width}px`,
      }),
      uploadActions: () => ({ remove: () => {}, retry: () => {} }),
      uploadLabels: () => ({
        describe: (name, state) => `${name}, ${state}`,
        failed: 'Upload failed',
        named: (action, name) => `${action}: ${name}`,
        queued: 'Waiting',
        remove: 'Remove',
        retry: 'Retry',
        uploading: 'Uploading',
      }),
    };
  },
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
      // Client-only identity of this node and state of an image that is not
      // settled yet. Every parsed image (reopened draft, paste, drop) gets its
      // own id, so copies of one attachment stay distinguishable. Only the
      // state marker is serialized, so placeholders can be stripped.
      uploadId: {
        default: null,
        parseHTML: () => newMailImageInstanceId(),
        rendered: false,
      },
      uploadName: { default: null, parseHTML: () => null, rendered: false },
      uploadState: {
        default: null,
        parseHTML: () => null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.uploadState
            ? { [MAIL_IMAGE_UPLOAD_MARKER]: String(attrs.uploadState) }
            : {},
      },
      naturalWidth: { default: null, parseHTML: () => null, rendered: false },
      naturalHeight: { default: null, parseHTML: () => null, rendered: false },
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
  // The wrapper hosts the corner resize handles around the image.
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node;
      const wrapper = document.createElement('span');
      wrapper.className = 'group relative inline-block max-w-full align-top';
      const image = document.createElement('img');
      wrapper.append(image);
      const upload = attachMailImageUploadView({
        wrapper,
        image,
        actions: () => this.options.uploadActions(),
        labels: () => this.options.uploadLabels(),
      });
      let resize: MailImageResizeController | null = null;
      const render = (attrs: Record<string, unknown>) => {
        syncMailImage(
          image,
          mailImageDomAttributes(this.options.HTMLAttributes, attrs)
        );
        const preview = resize?.preview;
        const width = preview
          ? String(preview)
          : normalizeMailImageWidth(attrs.width);
        applyMailImageLayout(wrapper, image, width);
        applyMailImageBox(wrapper, image, attrs, width !== null);
        upload.update(attrs);
      };
      resize = attachMailImageResize({
        wrapper,
        image,
        labels: () => this.options.resizeLabels(),
        restore: () => render(current.attrs),
        commit: (width) => {
          const position = getPos();
          if (position === undefined) return;
          editor
            .chain()
            .setNodeSelection(position)
            .updateAttributes(this.name, { width: String(width), height: null })
            .run();
        },
      });
      render(current.attrs);
      return {
        dom: wrapper,
        update: (next) => {
          if (next.type !== current.type) return false;
          current = next;
          render(next.attrs);
          return true;
        },
        stopEvent: (event) =>
          (resize?.owns(event.target) ?? false) || upload.owns(event.target),
        destroy: () => {
          resize?.destroy();
          upload.destroy();
        },
      };
    };
  },
});
