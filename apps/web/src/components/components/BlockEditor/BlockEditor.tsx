import { Sidebar } from '../Sidebar';
import { LinkMenu } from '../menus';
import { ContentItemMenu } from '../menus/ContentItemMenu';
import { TextMenu } from '../menus/TextMenu';
import { EditorHeader } from './components/EditorHeader';
// import ImageBlockMenu from '@/extensions/ImageBlock/components/ImageBlockMenu';
import { ColumnsMenu } from '@/extensions/MultiColumn/menus';
import { TableColumnMenu, TableRowMenu } from '@/extensions/Table/menus';
import { useBlockEditor } from '@/hooks/useBlockEditor';
import { useSidebar } from '@/hooks/useSidebar';
import '@/style/index.css';
import { createClient } from '@/utils/supabase/client';
import { TiptapCollabProvider } from '@hocuspocus/provider';
import { EditorContent, JSONContent } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import * as Y from 'yjs';

const supabase = createClient();

export const BlockEditor = ({
  aiToken,
  ydoc,
  document,
  provider,
  docId,
}: {
  aiToken?: string;
  hasCollab: boolean;
  ydoc: Y.Doc;
  document?: JSONContent;
  docId?: string;
  provider?: TiptapCollabProvider | null | undefined;
}) => {
  const menuContainerRef = useRef(null);
  const leftSidebar = useSidebar();
  const { editor, users, collabState } = useBlockEditor({
    aiToken,
    ydoc,
    document,
    provider,
  });

  useEffect(() => {
    const savedContent = localStorage.getItem('editorContent');
    if (savedContent) {
      editor?.commands.setContent(JSON.parse(savedContent));
    }

    const saveContentToDatabase = async () => {
      if (editor && docId) {
        const content = editor.getJSON();
        console.log(content, 'heloooo');
        try {
          const { error } = await supabase
            .from('workspace_documents')
            .update({ content: content })
            .eq('id', docId);

          if (error) {
            throw error;
          }

          console.log('Document saved to database successfully');
        } catch (error) {
          console.error('Error saving document to database:', error);
        }
      }
    };

    editor?.on('update', saveContentToDatabase);

    return () => {
      editor?.off('update', saveContentToDatabase);
    };
  }, [editor, docId]);

  if (!editor || !users) {
    return null;
  }

  return (
    <div className="flex h-full">
      <Sidebar
        isOpen={leftSidebar.isOpen}
        onClose={leftSidebar.close}
        editor={editor}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <EditorHeader
          editor={editor}
          collabState={collabState}
          users={users}
          isSidebarOpen={leftSidebar.isOpen}
          toggleSidebar={leftSidebar.toggle}
        />
        <EditorContent
          editor={editor}
          className="border-foreground/10 bg-foreground/5 h-full flex-1 overflow-y-auto pr-0 sm:pr-10 lg:pr-96"
        />
        <ContentItemMenu editor={editor} />
        <LinkMenu editor={editor} appendTo={menuContainerRef} />
        <TextMenu editor={editor} />
        <ColumnsMenu
          editor={editor}
          appendTo={menuContainerRef}
          children={undefined}
          trigger={undefined}
        />
        <TableRowMenu
          editor={editor}
          appendTo={menuContainerRef}
          children={undefined}
          trigger={undefined}
        />
        <TableColumnMenu
          editor={editor}
          appendTo={menuContainerRef}
          children={undefined}
          trigger={undefined}
        />
      </div>
    </div>
  );
};

export default BlockEditor;
