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
  return /\/drafts\/[^/]+\/attachments\/([^/?#]+)/u.exec(source)?.[1] ?? null;
}

let instanceSequence = 0;

/** Fresh identity for one image node in the editor. */
export function newMailImageInstanceId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `image-${Date.now()}-${++instanceSequence}`
  );
}

/**
 * Identity of one image node (an instance), as the user sees it. It is never
 * the server attachment id: copies of an image share one attachment but each
 * has its own instance id, so acting on one never touches another.
 */
export function mailImageNodeId(attrs: Record<string, unknown>) {
  return typeof attrs.uploadId === 'string' ? attrs.uploadId : null;
}

/** Source of an image that only exists in this browser. */
function isLocalSource(source: unknown) {
  return typeof source === 'string' && /^(?:blob|data):/iu.test(source);
}

/**
 * Keep instance ids unique. Copying within the editor (for example dragging
 * with a modifier key) can repeat a node's attributes; the repeat gets a new
 * id. A copied placeholder (or a stray local source) can never resolve, so it
 * is dropped instead. Returns whether it changed the document.
 */
export function ensureUniqueMailImageIds(editor: Editor) {
  if (editor.isDestroyed) return false;
  const seen = new Set<string>();
  const fixes: {
    attrs: Record<string, unknown> | null;
    pos: number;
    size: number;
  }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return true;
    const id = mailImageNodeId(node.attrs);
    const stray = !node.attrs.uploadState && isLocalSource(node.attrs.src);
    if (id && !seen.has(id) && !stray) {
      seen.add(id);
      return false;
    }
    fixes.push({
      attrs:
        node.attrs.uploadState || stray
          ? null
          : { ...node.attrs, uploadId: newMailImageInstanceId() },
      pos,
      size: node.nodeSize,
    });
    return false;
  });
  if (!fixes.length) return false;
  const tr = editor.state.tr;
  // Back to front: edits never shift a position that is still to be fixed.
  for (const fix of fixes.reverse()) {
    if (fix.attrs) tr.setNodeMarkup(fix.pos, undefined, fix.attrs);
    else tr.delete(fix.pos, fix.pos + fix.size);
  }
  editor.view.dispatch(tr.setMeta('addToHistory', false));
  return true;
}

/**
 * Operations on image nodes by instance id. Every call resolves the node's
 * current position at call time, so typing or deleting around a placeholder
 * while an upload is in flight never moves the result. None of them take focus,
 * add undo history, or touch the selection.
 */
export interface MailImageNodes {
  /** The server attachment an instance shows (null for a local or foreign source). */
  inspect(id: string): { attachmentId: string | null } | null;
  /** Instance ids of every image node currently in the document. */
  liveIds(): Set<string>;
  insertPending(input: {
    name: string;
    src: string;
    state: MailImageNodeState;
    uploadId: string;
  }): boolean;
  /** Nodes that still show the attachment, apart from `except` and hidden ones. */
  references(attachmentId: string, except?: string): number;
  remove(id: string): boolean;
  /** Delete every node that shows the attachment, hidden or not. */
  removeReferences(attachmentId: string): void;
  /** Swap the preview for the server image in place and settle the node. */
  resolve(uploadId: string, src: string): boolean;
  setRemoving(id: string, removing: boolean): void;
  setSize(uploadId: string, width: number, height: number): void;
  setState(uploadId: string, state: MailImageNodeState): void;
}

interface Found {
  attachmentId: string | null;
  attrs: Record<string, unknown>;
  pos: number;
  size: number;
}

export function createMailImageNodes(editor: Editor): MailImageNodes {
  const images = (): Found[] => {
    const hits: Found[] = [];
    if (editor.isDestroyed) return hits;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'image') return true;
      hits.push({
        attachmentId:
          typeof node.attrs.src === 'string'
            ? mailImageAttachmentId(node.attrs.src)
            : null,
        attrs: node.attrs,
        pos,
        size: node.nodeSize,
      });
      return false;
    });
    return hits;
  };
  const find = (id: string) =>
    images().find((hit) => mailImageNodeId(hit.attrs) === id) ?? null;
  const patch = (id: string, next: Record<string, unknown>) => {
    const hit = find(id);
    if (!hit) return false;
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(hit.pos, undefined, { ...hit.attrs, ...next })
        .setMeta('addToHistory', false)
    );
    return true;
  };
  const drop = (hits: Found[]) => {
    if (!hits.length) return false;
    const tr = editor.state.tr;
    for (const hit of [...hits].reverse())
      tr.delete(hit.pos, hit.pos + hit.size);
    editor.view.dispatch(tr.setMeta('addToHistory', false));
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
    inspect(id) {
      const hit = find(id);
      return hit ? { attachmentId: hit.attachmentId } : null;
    },
    liveIds() {
      const ids = new Set<string>();
      for (const hit of images()) {
        const id = mailImageNodeId(hit.attrs);
        if (id) ids.add(id);
      }
      return ids;
    },
    references: (attachmentId, except) =>
      images().filter(
        (hit) =>
          hit.attachmentId === attachmentId &&
          mailImageNodeId(hit.attrs) !== except &&
          hit.attrs.uploadState !== 'removing'
      ).length,
    remove(id) {
      const hit = find(id);
      return hit ? drop([hit]) : false;
    },
    removeReferences(attachmentId) {
      drop(images().filter((hit) => hit.attachmentId === attachmentId));
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
