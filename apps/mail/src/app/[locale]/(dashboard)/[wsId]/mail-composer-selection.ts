import type { Editor } from '@tiptap/react';

export interface ComposerSelection {
  text: string;
  apply: (content: string) => boolean;
}

export function captureComposerSelection(
  editor: Editor
): ComposerSelection | null {
  const { from, to, empty } = editor.state.selection;
  const document = editor.state.doc;
  const text = document.textBetween(from, to, '\n');
  if (empty || !text.trim()) return null;
  return {
    text,
    apply(content) {
      if (editor.isDestroyed || !editor.state.doc.eq(document)) return false;
      const marks = document
        .resolve(from)
        .marks()
        .map((mark) => mark.toJSON());
      const replacement = content
        .split('\n')
        .flatMap((line, index) => [
          ...(index ? [{ type: 'hardBreak' }] : []),
          ...(line ? [{ type: 'text', text: line, marks }] : []),
        ]);
      editor.chain().focus().insertContentAt({ from, to }, replacement).run();
      return true;
    },
  };
}
