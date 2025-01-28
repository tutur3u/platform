'use client';

import { LinkMenu } from '../menus';
import { ContentItemMenu } from '../menus/ContentItemMenu';
import { TextMenu } from '../menus/TextMenu';
import { EditorHeader } from './components/EditorHeader';
import { ColumnsMenu } from '@/extensions/MultiColumn/menus';
import { TableColumnMenu, TableRowMenu } from '@/extensions/Table/menus';
import { useBlockEditor } from '@/hooks/useBlockEditor';
import { useSidebar } from '@/hooks/useSidebar';
import { cn } from '@/lib/utils';
import '@/style/index.css';
import { Editor } from '@tiptap/core';
import { EditorContent, JSONContent } from '@tiptap/react';
import { Loader2 } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

export interface BlockEditorRef {
  editor: Editor | null;
}

export const BlockEditor = forwardRef<
  BlockEditorRef,
  {
    aiToken?: string;
    document?: JSONContent;
    docId?: string;
    wsId?: string;
    onSave?: (data: any) => void;
    onSyncStatusChange?: (status: {
      type: 'saving' | 'saved' | 'error';
      message: string;
    }) => void;
    editable?: boolean;
    provider?: any;
  }
>(
  (
    {
      aiToken,
      document,
      docId,
      wsId,
      onSave,
      onSyncStatusChange,
      editable: editableProp = true,
      provider,
    },
    ref
  ) => {
    const menuContainerRef = useRef<any>(null);
    const leftSidebar = useSidebar();
    const lastSavedContent = useRef<string>('');
    const isDirty = useRef<boolean>(false);
    const isSaving = useRef<boolean>(false);
    const saveTimeout = useRef<ReturnType<typeof setTimeout>>(null);
    const pendingSave = useRef<JSONContent | null>(null);

    // If onSave is not provided, the editor should be in preview mode
    const isPreviewMode = !onSave;
    const editable = editableProp && !isPreviewMode;

    // Status update with minimal debounce
    const notifyStatusChange = useCallback(
      (status: { type: 'saving' | 'saved' | 'error'; message: string }) => {
        if (onSyncStatusChange) {
          onSyncStatusChange(status);
        }
      },
      [onSyncStatusChange]
    );

    // Handle save with proper debouncing
    const handleSave = useCallback(
      async (content: JSONContent) => {
        if (isSaving.current) {
          pendingSave.current = content;
          return;
        }

        try {
          isSaving.current = true;
          notifyStatusChange({ type: 'saving', message: '...' });

          await onSave?.(content);
          lastSavedContent.current = JSON.stringify(content);
          isDirty.current = false;
          notifyStatusChange({ type: 'saved', message: '✓' });

          // Handle any pending saves that came in while we were saving
          if (pendingSave.current && pendingSave.current !== content) {
            const pendingContent = pendingSave.current;
            pendingSave.current = null;
            await handleSave(pendingContent);
          }
        } catch (error) {
          console.error('Error saving:', error);
          isDirty.current = true;
          notifyStatusChange({ type: 'error', message: '!' });
        } finally {
          isSaving.current = false;
        }
      },
      [onSave, notifyStatusChange]
    );

    const debouncedSave = useCallback(
      (content: JSONContent) => {
        if (saveTimeout.current) {
          clearTimeout(saveTimeout.current);
        }

        const contentStr = JSON.stringify(content);
        if (contentStr === lastSavedContent.current) {
          return;
        }

        isDirty.current = true;
        notifyStatusChange({ type: 'saving', message: '...' });

        saveTimeout.current = setTimeout(() => {
          handleSave(content);
        }, 1000);
      },
      [handleSave, notifyStatusChange]
    );

    const { editor } = useBlockEditor({
      aiToken,
      document,
      wsId,
      editable,
      docId,
      provider,
      onSyncStatusChange: notifyStatusChange,
    });

    useImperativeHandle(
      ref,
      () => ({
        editor: editor,
      }),
      [editor]
    );

    // Set initial content
    useEffect(() => {
      if (editor && document) {
        const contentStr = JSON.stringify(document);
        if (contentStr !== JSON.stringify(editor.getJSON())) {
          editor.commands.setContent(document);
          lastSavedContent.current = contentStr;
          isDirty.current = false;
        }
      }
    }, [editor, document]);

    // Handle content updates
    useEffect(() => {
      if (!editor) return;

      const handleUpdate = () => {
        const content = editor.getJSON();
        debouncedSave(content);
      };

      editor.on('update', handleUpdate);

      return () => {
        editor.off('update', handleUpdate);
        if (saveTimeout.current) {
          clearTimeout(saveTimeout.current);
        }
      };
    }, [editor, debouncedSave]);

    // Save on unmount if dirty
    useEffect(() => {
      return () => {
        if (isDirty.current && editor) {
          const content = editor.getJSON();
          handleSave(content);
        }

        if (saveTimeout.current) {
          clearTimeout(saveTimeout.current);
        }
      };
    }, [editor, handleSave]);

    if (!editor) {
      return (
        <div className="flex h-fit items-center justify-center">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        </div>
      );
    }

    return (
      <div className={cn('flex w-full', editable ? 'h-screen' : 'h-auto')}>
        <div
          className={cn(
            'relative w-full',
            editable && 'flex flex-col overflow-hidden'
          )}
        >
          {editable && (
            <EditorHeader
              editor={editor}
              isSidebarOpen={leftSidebar.isOpen}
              toggleSidebar={leftSidebar.toggle}
            />
          )}
          <div
            className={cn(
              'relative bg-transparent',
              editable ? 'flex-1 overflow-y-auto px-4 lg:px-8' : 'px-0'
            )}
          >
            <div className="mx-auto max-w-4xl">
              <EditorContent
                editor={editor}
                className={cn(
                  'prose prose-neutral dark:prose-invert max-w-none',
                  'prose-headings:font-medium prose-headings:tracking-tight',
                  'prose-h1:text-4xl prose-h1:font-bold prose-h1:leading-tight',
                  'prose-h2:text-3xl prose-h2:font-semibold',
                  'prose-h3:text-2xl prose-h3:font-medium',
                  'prose-p:leading-7 prose-p:my-4 prose-p:text-base',
                  'prose-pre:bg-muted/50 prose-pre:p-4 prose-pre:rounded-lg',
                  'prose-code:bg-muted/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none',
                  'prose-a:text-primary hover:prose-a:text-primary/80 prose-a:no-underline hover:prose-a:underline',
                  'prose-blockquote:border-l-primary/50 prose-blockquote:bg-muted/20 prose-blockquote:py-0.5 prose-blockquote:text-muted-foreground prose-blockquote:italic',
                  'prose-img:rounded-lg prose-img:shadow-lg prose-img:border prose-img:border-border/50',
                  'prose-table:border prose-table:border-border',
                  'prose-th:bg-muted/50 prose-th:p-2 prose-th:border prose-th:border-border',
                  'prose-td:p-2 prose-td:border prose-td:border-border',
                  'prose-ul:my-6 prose-ul:list-disc prose-ul:pl-6',
                  'prose-ol:my-6 prose-ol:list-decimal prose-ol:pl-6',
                  'prose-li:my-2',
                  'prose-hr:my-8 prose-hr:border-border/50',
                  '[&_*]:transition-colors [&_*]:duration-200',
                  'selection:bg-primary/20 selection:text-primary',
                  editable && 'min-h-[calc(100vh-8rem)] pb-40',
                  isPreviewMode && 'pointer-events-none select-none'
                )}
              />
            </div>
          </div>
          {editable && (
            <>
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
            </>
          )}
        </div>
      </div>
    );
  }
);

export default BlockEditor;
