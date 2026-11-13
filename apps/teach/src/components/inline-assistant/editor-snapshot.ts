import type { Node } from '@tiptap/pm/model';
import type { InlineSuggestion } from '@tuturuuu/education-core/education/inline-assistant';

/** Explicit UTF-16 -> ProseMirror mapping; never insert a plain-text document. */
export function readEditorSnapshot(doc: Node) {
  let text = '';
  const positions: number[] = [];
  let blocks = 0;
  doc.descendants((node, pos) => {
    if (node.isTextblock && blocks++ > 0) {
      text += '\n';
      positions.push(-1);
    }
    if (node.isText) {
      text += node.text;
      for (let i = 0; i < node.nodeSize; i++) positions.push(pos + i);
    } else if (node.isLeaf && !node.isTextblock) {
      text += node.type.name === 'hardBreak' ? '\n' : '\ufffc';
      positions.push(-1);
    }
  });
  return { text, positions, revision: JSON.stringify(doc.toJSON()) };
}

export function suggestionRange(doc: Node, suggestion: InlineSuggestion) {
  const snapshot = readEditorSnapshot(doc);
  if (
    snapshot.text.slice(suggestion.from, suggestion.to) !== suggestion.original
  )
    return null;
  const start = snapshot.positions[suggestion.from];
  const end = snapshot.positions[suggestion.to - 1];
  if (start === undefined || end === undefined || start < 0 || end < 0)
    return null;
  // Restrict replacements to contiguous inline text; preserve block/atom structure.
  for (let i = suggestion.from; i < suggestion.to; i++) {
    if (snapshot.positions[i] !== start + i - suggestion.from) return null;
  }
  if (!doc.resolve(start).sameParent(doc.resolve(end + 1))) return null;
  return { from: start, to: end + 1 };
}
