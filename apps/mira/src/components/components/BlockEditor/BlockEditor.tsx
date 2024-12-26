// import { Sidebar } from '../Sidebar';
import { LinkMenu } from '../menus';
import { ContentItemMenu } from '../menus/ContentItemMenu';
import { TextMenu } from '../menus/TextMenu';
import { EditorHeader } from './components/EditorHeader';
import { Threads } from '@/app/[locale]/(dashboard)/[wsId]/documents/[documentId]/Threads';
import { Toolbar } from '@/app/[locale]/(dashboard)/[wsId]/documents/[documentId]/Toolbar';
import { ColumnsMenu } from '@/extensions/MultiColumn/menus';
import { TableColumnMenu, TableRowMenu } from '@/extensions/Table/menus';
import { useBlockEditor } from '@/hooks/useBlockEditor';
import { useSidebar } from '@/hooks/useSidebar';
import { userColors } from '@/lib/constants';
import { randomElement } from '@/lib/utils/index';
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
  wsId,
}: {
  aiToken?: string;
  hasCollab: boolean;
  ydoc: Y.Doc;
  document?: JSONContent;
  docId?: string;
  wsId?: string | undefined;
  provider?: TiptapCollabProvider | null | undefined;
}) => {
  const menuContainerRef = useRef(null);
  const leftSidebar = useSidebar();
  const { editor, users, collabState } = useBlockEditor({
    aiToken,
    ydoc,
    document,
    provider,
    wsId,
  });

  useEffect(() => {
    const savedContent = localStorage.getItem('editorContent');
    if (savedContent) {
      editor?.commands.setContent(JSON.parse(savedContent));
    }

    const saveContentToDatabase = async () => {
      if (editor && docId) {
        const content = editor.getJSON();
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
  editor.commands.updateUser({
    name: 'John Doe',
    color: randomElement(userColors),
    // avatar: 'https://unavatar.io/github/ueberdosis',
  });
  return (
    <div className="flex h-full">
      {/* <Sidebar
        isOpen={leftSidebar.isOpen}
        onClose={leftSidebar.close}
        editor={editor}
      /> */}
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
        <Toolbar editor={editor} />
        <Threads editor={editor} />
      </div>
    </div>
  );
};

export default BlockEditor;
