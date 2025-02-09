import { AiImage, AiWriter, StarterKit } from '@/extensions';
import { Ai } from '@/extensions/Ai';
import { ExtensionKit } from '@/extensions/extension-kit';
import type { AnyExtension } from '@tiptap/core';
import { JSONContent } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { ReactRenderer, useEditor } from '@tiptap/react';
import { SuggestionProps } from '@tiptap/suggestion';
import { createClient } from '@tutur3u/supabase/next/client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';

interface SyncStatus {
  type: 'saving' | 'saved' | 'error';
  message: string;
}

const renderItems = () => {
  let component: ReactRenderer | null = null;

  return {
    onUpdate: (props: SuggestionProps) => {
      if (!component) return;

      component.updateProps({
        ...props,
        clientRect: props.clientRect,
      });
    },

    onKeyDown: (props: { event: KeyboardEvent }) => {
      if (!component?.element) return false;

      const { event } = props;
      const selectedItem = component.element.querySelector(
        '.bg-gray-200'
      ) as HTMLElement;

      if (!selectedItem) return false;

      if (event.key === 'ArrowUp') {
        const prev = selectedItem.previousElementSibling as HTMLElement;
        if (prev) prev.click();
        return true;
      }

      if (event.key === 'ArrowDown') {
        const next = selectedItem.nextElementSibling as HTMLElement;
        if (next) next.click();
        return true;
      }

      if (event.key === 'Enter') {
        selectedItem.click();
        return true;
      }

      if (event.key === 'Escape') {
        component.destroy();
        return true;
      }

      return false;
    },

    onExit: () => {
      if (component) {
        component.destroy();
        component = null;
      }
    },
  };
};

interface BlockEditorProps {
  aiToken?: string;
  document?: JSONContent;
  userId?: string;
  userName?: string;
  wsId?: string | undefined | null;
  editable?: boolean;
  docId?: string;
  provider?: any;
  // eslint-disable-next-line no-unused-vars
  onSyncStatusChange?: (status: SyncStatus) => void;
}

export const useBlockEditor = ({
  aiToken,
  document,
  userId,
  userName = 'Maxi',
  wsId,
  editable = true,
  docId,
  onSyncStatusChange,
}: BlockEditorProps) => {
  const t = useTranslations();
  const editor = useEditor(
    {
      editable,
      injectCSS: false,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: 'min-h-screen bg-grey-100 max-w-[1500px] bg-grey-100 mx-auto',
        },
      },
      onCreate: ({ editor }) => {
        if (typeof window !== 'undefined') {
          (window as any).editor = editor;

          // Set initial content from document prop
          if (document) {
            editor.commands.setContent(document);
            lastSavedContent.current = JSON.stringify(document);
          }
        }
      },
      onBeforeCreate: ({ editor }) => {
        if (typeof window !== 'undefined') {
          (window as any).editor = editor;
        }
      },
      onDestroy: () => {
        if (typeof window !== 'undefined') {
          (window as any).editor = null;
        }
      },
      extensions: [
        ...ExtensionKit({
          provider: null,
        }),
        StarterKit.configure({
          history: false,
          paragraph: false,
          bold: false,
          bulletList: false,
          code: false,
          codeBlock: false,
          document: false,
          dropcursor: false,
          gapcursor: false,
          hardBreak: false,
          heading: false,
          horizontalRule: false,
          italic: false,
          listItem: false,
          orderedList: false,
          strike: false,
          text: false,
        }),
        ...(editable
          ? [
              Mention.configure({
                HTMLAttributes: {
                  class:
                    'bg-purple-100 rounded-md text-purple-600 px-1 py-0.5 break-words',
                },
                suggestion: {
                  items: async ({ query }) => {
                    try {
                      const response = await fetch(
                        `/api/v1/workspaces/${wsId}/Mention`
                      );
                      const data = await response.json();

                      if (!data.email || !Array.isArray(data.email)) {
                        return [];
                      }

                      return data.email
                        .filter((item: any) =>
                          item.toLowerCase().startsWith(query.toLowerCase())
                        )
                        .slice(0, 5);
                    } catch (error) {
                      console.error('Error fetching mentions:', error);
                      return [];
                    }
                  },
                  render: renderItems,
                },
              }),
            ]
          : []),
        ...(editable && aiToken
          ? [
              AiWriter.configure({
                authorId: userId,
                authorName: userName,
              }),
              AiImage.configure({
                authorId: userId,
                authorName: userName,
              }),
              Ai.configure({ token: aiToken }),
            ]
          : []),
      ].filter((e): e is AnyExtension => e !== undefined),
    },
    [document, editable]
  );

  const lastSavedContent = useRef<string>('');
  const isDirty = useRef<boolean>(false);
  const saveTimeout = useRef<any>(undefined);
  const supabase = createClient();

  const saveContentToDatabase = useCallback(
    async (content: JSONContent) => {
      if (!docId) return;

      try {
        if (!isDirty.current) return; // Don't save if not dirty

        onSyncStatusChange?.({
          type: 'saving',
          message: t('common.saving'),
        });

        const { error } = await supabase
          .from('workspace_documents')
          .update({ content })
          .eq('id', docId);

        if (error) {
          throw error;
        }

        lastSavedContent.current = JSON.stringify(content);
        isDirty.current = false;
        onSyncStatusChange?.({
          type: 'saved',
          message: t('common.saved'),
        });
      } catch (error) {
        console.error('Error saving document to database:', error);
        onSyncStatusChange?.({
          type: 'error',
          message: t('common.error_saving'),
        });
        // Reset dirty state to allow retry
        isDirty.current = true;
      }
    },
    [docId, onSyncStatusChange]
  );

  const debouncedSave = useCallback(
    (content: JSONContent) => {
      // Clear any existing timeout
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
      }

      // Set new timeout
      saveTimeout.current = setTimeout(() => {
        saveContentToDatabase(content);
      }, 1000);
    },
    [saveContentToDatabase]
  );

  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      const content = editor.getJSON();
      const contentStr = JSON.stringify(content);

      // Only show unsaved changes if content actually changed
      if (contentStr !== lastSavedContent.current) {
        isDirty.current = true;
        onSyncStatusChange?.({
          type: 'saving',
          message: t('common.unsaved_changes'),
        });
        debouncedSave(content);
      }
    };

    editor.on('update', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
      }
    };
  }, [editor, debouncedSave, onSyncStatusChange]);

  // Save on unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      if (isDirty.current && editor) {
        saveContentToDatabase(editor.getJSON());
      }
    };
  }, [editor, saveContentToDatabase]);

  return { editor };
};
