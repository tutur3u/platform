import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import {
  BIBLIOGRAPHY_NODE_NAME,
  buildCitationAttrs,
  CITATION_NODE_NAME,
  citationSnapshotKey,
  normalizeSnapshot,
} from './snapshot';
import type {
  CitationNodeAttrs,
  CitationSnapshot,
  CitationStyleId,
} from './types';

function findNode(
  doc: ProseMirrorNode,
  match: (node: ProseMirrorNode) => boolean
): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (match(node)) {
      found = pos;
      return false;
    }
    return true;
  });
  // Assigned inside the callback, which control-flow narrowing cannot see.
  return found as number | null;
}

export function findCitationPos(doc: ProseMirrorNode, citationId: string) {
  return findNode(
    doc,
    (node) =>
      node.type.name === CITATION_NODE_NAME &&
      node.attrs.citationId === citationId
  );
}

function ensureBibliography(tr: Transaction, style: CitationStyleId) {
  const exists = findNode(
    tr.doc,
    (node) => node.type.name === BIBLIOGRAPHY_NODE_NAME
  );
  if (exists !== null) return;
  const type = tr.doc.type.schema.nodes[BIBLIOGRAPHY_NODE_NAME];
  if (type) tr.insert(tr.doc.content.size, type.create({ style }));
}

/**
 * Inserts a citation and, in the same undo step, a references block at the end
 * of the document when none exists yet.
 */
export function insertCitation(
  editor: Editor,
  input: { pos: number; itemId: string | null; snapshot: CitationSnapshot },
  style: CitationStyleId
) {
  const pos = Math.max(0, Math.min(input.pos, editor.state.doc.content.size));
  return editor
    .chain()
    .focus()
    .insertContentAt(pos, {
      type: CITATION_NODE_NAME,
      attrs: buildCitationAttrs({
        itemId: input.itemId,
        snapshot: input.snapshot,
      }),
    })
    .command(({ tr }) => {
      ensureBibliography(tr, style);
      return true;
    })
    .run();
}

export function updateCitation(
  editor: Editor,
  citationId: string,
  patch: Partial<Omit<CitationNodeAttrs, 'citationId'>>
) {
  const pos = findCitationPos(editor.state.doc, citationId);
  if (pos === null) return false;
  return editor
    .chain()
    .command(({ tr }) => {
      for (const [key, value] of Object.entries(patch)) {
        tr.setNodeAttribute(pos, key, value);
      }
      return true;
    })
    .run();
}

/**
 * Applies a reviewed repair only while the citation still holds the snapshot the
 * repair was computed from. Returns false when the base changed (for example an
 * update from the library landed first), so a stale proposal is never applied.
 */
export function applyRepairedSnapshot(
  editor: Editor,
  citationId: string,
  baseKey: string,
  next: CitationSnapshot
) {
  const pos = findCitationPos(editor.state.doc, citationId);
  if (pos === null) return false;
  const current = normalizeSnapshot(
    editor.state.doc.nodeAt(pos)?.attrs.snapshot
  );
  if (!current || citationSnapshotKey(current) !== baseKey) return false;
  return editor
    .chain()
    .command(({ tr }) => {
      tr.setNodeAttribute(pos, 'snapshot', next);
      return true;
    })
    .run();
}

export function setCitationStyle(editor: Editor, style: CitationStyleId) {
  return editor
    .chain()
    .command(({ tr }) => {
      const pos = findNode(
        tr.doc,
        (node) => node.type.name === BIBLIOGRAPHY_NODE_NAME
      );
      if (pos === null) ensureBibliography(tr, style);
      else tr.setNodeAttribute(pos, 'style', style);
      return true;
    })
    .run();
}
