import type { Editor } from '@tiptap/react';

/** DOM marker serialized only for placeholder images; never for settled ones. */
export const MAIL_IMAGE_UPLOAD_MARKER = 'data-mail-upload';

export type MailImageNodeState = 'failed' | 'queued' | 'removing' | 'uploading';

const IMAGE_TAG = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu;
const PLACEHOLDER = new RegExp(
  `\\s${MAIL_IMAGE_UPLOAD_MARKER}=|\\ssrc=["'](?:blob|data):`,
  'iu'
);

/**
 * Drop every placeholder image (queued, uploading, failed or hidden for
 * removal) and any local blob source. Draft saves and sends only ever see
 * images that exist on the server.
 */
export function stripPendingMailImages(html: string) {
  if (!html.includes('<img')) return html;
  return html.replace(IMAGE_TAG, (tag) => (PLACEHOLDER.test(tag) ? '' : tag));
}

/** Attachment id inside a raw draft image source, or null. */
export function mailImageAttachmentId(source: string) {
  return (
    /\/drafts\/[^/]+\/attachments\/([^/?#]+)/u.exec(source)?.[1] ?? null
  );
}

function matchesImage(attrs: Record<string, unknown>, id: string) {
  if (attrs.uploadId === id) return true;
  return (
    typeof attrs.src === 'string' && mailImageAttachmentId(attrs.src) === id
  );
}

/** Image node id as the user sees it: client upload id, else attachment id. */
export function mailImageNodeId(attrs: Record<string, unknown>) {
  if (typeof attrs.uploadId === 'string') return attrs.uploadId;
  return typeof attrs.src === 'string' ? mailImageAttachmentId(attrs.src) : null;
}

/**
 * Operations on image nodes by id. Every call resolves the node's current
 * position at call time, so typing or deleting around a placeholder while an
 * upload is in flight never moves the result. None of them take focus, add
 * undo history, or touch the selection.
 */
export interface MailImageNodes {
  /** Ids of every image node currently in the document. */
  liveIds(): Set<string>;
  insertPending(input: {
    name: string;
    src: string;
    state: MailImageNodeState;
    uploadId: string;
  }): boolean;
  remove(id: string): boolean;
  /** Swap the preview for the server image in place and settle the node. */
  resolve(uploadId: string, src: string): boolean;
  setRemoving(id: string, removing: boolean): void;
  setSize(uploadId: string, width: number, height: number): void;
  setState(uploadId: string, state: MailImageNodeState): void;
}

interface Found {
  attrs: Record<string, unknown>;
  pos: number;
  size: number;
}

export function createMailImageNodes(editor: Editor): MailImageNodes {
  const find = (id: string): Found | null => {
    const hits: Found[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (hits.length) return false;
      if (node.type.name === 'image' && matchesImage(node.attrs, id))
        hits.push({ attrs: node.attrs, pos, size: node.nodeSize });
      return hits.length === 0;
    });
    return hits[0] ?? null;
  };
  const patch = (id: string, next: Record<string, unknown>) => {
    if (editor.isDestroyed) return false;
    const hit = find(id);
    if (!hit) return false;
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(hit.pos, undefined, { ...hit.attrs, ...next })
        .setMeta('addToHistory', false)
    );
    return true;
  };

  return {
    insertPending: ({ name, src, state, uploadId }) =>
      !editor.isDestroyed &&
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'image',
          attrs: { src, uploadId, uploadName: name, uploadState: state },
        })
        .setMeta('addToHistory', false)
        .run(),
    liveIds() {
      const ids = new Set<string>();
      if (editor.isDestroyed) return ids;
      editor.state.doc.descendants((node) => {
        if (node.type.name !== 'image') return true;
        const id = mailImageNodeId(node.attrs);
        if (id) ids.add(id);
        return false;
      });
      return ids;
    },
    remove(id) {
      if (editor.isDestroyed) return false;
      const hit = find(id);
      if (!hit) return false;
      editor.view.dispatch(
        editor.state.tr
          .delete(hit.pos, hit.pos + hit.size)
          .setMeta('addToHistory', false)
      );
      return true;
    },
    resolve: (uploadId, src) => patch(uploadId, { src, uploadState: null }),
    setRemoving: (id, removing) => {
      patch(id, { uploadState: removing ? 'removing' : null });
    },
    setSize: (uploadId, width, height) => {
      patch(uploadId, { naturalHeight: height, naturalWidth: width });
    },
    setState: (uploadId, state) => {
      patch(uploadId, { uploadState: state });
    },
  };
}
