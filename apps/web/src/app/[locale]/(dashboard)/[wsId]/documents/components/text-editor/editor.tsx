'use client';

import { Editor, EditorContent } from '@tiptap/react';
import { FC} from 'react';

interface DocumentEditorProps {
  editor: Editor;
}

const DocumentEditor: FC<DocumentEditorProps> = ({
  editor,
}) => {
  return (
    <EditorContent editor={editor} />
  );
};

export default DocumentEditor;
