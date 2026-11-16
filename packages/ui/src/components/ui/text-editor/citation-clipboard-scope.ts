import type { Editor } from '@tiptap/react';
import type { CitationClipboardScope } from './citation-clipboard';

const providers = new WeakMap<Editor, () => CitationClipboardScope>();

/** The host computes from the current document at copy time. */
export function registerCitationClipboardScope(
  editor: Editor,
  provider: () => CitationClipboardScope
) {
  providers.set(editor, provider);
  return () => {
    if (providers.get(editor) === provider) providers.delete(editor);
  };
}

export function citationClipboardScope(editor: Editor) {
  try {
    return providers.get(editor)?.();
  } catch {
    return undefined;
  }
}
