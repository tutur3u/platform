import type { Editor } from '@tiptap/react';
import { dispatchIfOpen } from './upload-placeholder';

/** `closed`: the editor was destroyed while the upload ran. */
export type MediaInsertResult = 'inserted' | 'closed' | 'missing-node';

/**
 * Inserts an uploaded image or video at the cursor. The upload resolves after
 * an await, so the editor may have closed by then; nothing is written to a
 * destroyed editor. Images start at 60% of the editor width.
 */
export function insertUploadedMedia(
  editor: Editor,
  kind: 'image' | 'video',
  src: string
): MediaInsertResult {
  if (editor.isDestroyed) return 'closed';
  const { view } = editor;
  const { state } = view;
  const node =
    kind === 'image'
      ? state.schema.nodes.imageResize
      : state.schema.nodes.video;
  if (!node) return 'missing-node';

  const dom = view.dom as HTMLElement;
  const width =
    (dom.querySelector('.ProseMirror')?.clientWidth || dom.clientWidth || 800) *
    0.6;
  const attrs = kind === 'image' ? { src, width } : { src };
  const tr = state.tr.insert(state.selection.from, node.create(attrs));
  return dispatchIfOpen(view, tr) ? 'inserted' : 'closed';
}
