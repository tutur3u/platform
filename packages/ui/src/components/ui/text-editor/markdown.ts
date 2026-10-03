import { Slice } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import { serializeClipboardText } from './clipboard-serialization';
import { markdownToHtml } from './markdown-paste-extension';

/** The same sanitized Markdown parser used by editor paste. */
export const parseEditorMarkdown = markdownToHtml;
/** Export a complete document using the in-house clipboard serializer. */
export function serializeEditorMarkdown(editor: Editor) {
  return serializeClipboardText(new Slice(editor.state.doc.content, 0, 0));
}
