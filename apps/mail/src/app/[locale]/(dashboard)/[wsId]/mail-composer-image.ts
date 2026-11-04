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
    };
  },
  // A node view changes the displayed DOM only. Image's normal renderHTML
  // serializer keeps the raw src in getHTML(), draft saves and send payloads.
  addNodeView() {
    return ({ HTMLAttributes }) => {
      const image = document.createElement('img');
      const attributes: Record<string, unknown> = {
        ...this.options.HTMLAttributes,
        ...HTMLAttributes,
      };
      for (const [name, value] of Object.entries(attributes)) {
        if (typeof value !== 'string' && typeof value !== 'number') continue;
        image.setAttribute(
          name,
          name === 'src' ? withAppBase(String(value)) : String(value)
        );
      }
      return { dom: image };
    };
  },
});
