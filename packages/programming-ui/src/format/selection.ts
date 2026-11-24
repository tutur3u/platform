import * as Y from 'yjs';

/** The caret or selection of the open file, as offsets into its text. */
export interface TextSelection {
  anchor: number;
  head: number;
}

/**
 * What the format action needs from the code editor, kept apart from Monaco
 * so the rule for where the cursor ends up is testable on its own.
 */
export interface EditorSelectionHandle {
  getSelection: () => TextSelection | null;
  /**
   * Puts the selection back once the editor shows `expected`, which is when
   * the formatted text has reached it from the shared document.
   */
  setSelection: (selection: TextSelection, expected: string) => void;
}

/**
 * Keeps a selection logically in place across an edit to `text` made by
 * `edit`. Each end is held as a Yjs relative position, so text that moves
 * keeps its place; an end inside the replaced span lands on that span's edge.
 */
export function keepSelection(
  text: Y.Text,
  selection: TextSelection | null,
  edit: () => void
): TextSelection | null {
  const doc = text.doc;
  if (!selection || !doc) {
    edit();
    return null;
  }
  const hold = (index: number) =>
    Y.createRelativePositionFromTypeIndex(text, index);
  const anchor = hold(selection.anchor);
  const head = hold(selection.head);
  edit();
  const at = (position: Y.RelativePosition, fallback: number) =>
    Y.createAbsolutePositionFromRelativePosition(position, doc)?.index ??
    fallback;
  const length = text.length;
  const clamp = (index: number) => Math.max(0, Math.min(index, length));
  return {
    anchor: clamp(at(anchor, selection.anchor)),
    head: clamp(at(head, selection.head)),
  };
}
