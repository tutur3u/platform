import type * as monaco from 'monaco-editor';
import type { EditorSelectionHandle } from './selection';

/** How long to wait for a rewritten file to reach the editor before giving up on restoring. */
const RESTORE_WINDOW_MS = 1500;

/** Selection controls over a Monaco editor, in offsets into the file's text. */
export function selectionHandle(
  editor: monaco.editor.IStandaloneCodeEditor
): EditorSelectionHandle {
  return {
    getSelection() {
      const model = editor.getModel();
      const selection = editor.getSelection();
      if (!model || !selection) return null;
      return {
        anchor: model.getOffsetAt(selection.getStartPosition()),
        head: model.getOffsetAt(selection.getEndPosition()),
      };
    },
    setSelection({ anchor, head }, expected) {
      const place = () => {
        const model = editor.getModel();
        if (!model || model.getValue() !== expected) return false;
        const from = model.getPositionAt(anchor);
        const to = model.getPositionAt(head);
        editor.setSelection({
          selectionStartLineNumber: from.lineNumber,
          selectionStartColumn: from.column,
          positionLineNumber: to.lineNumber,
          positionColumn: to.column,
        });
        editor.revealPositionInCenterIfOutsideViewport(to);
        return true;
      };
      if (place()) return;
      // The formatted text arrives through the shared document, so the model
      // is updated a moment later.
      const listener = editor.onDidChangeModelContent(() => {
        if (!place()) return;
        listener.dispose();
        clearTimeout(timer);
      });
      const timer = setTimeout(() => listener.dispose(), RESTORE_WINDOW_MS);
    },
  };
}
