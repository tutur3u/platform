import { userColors, userNames } from '../lib/constants';
import type { EditorUser } from '@/components/components/BlockEditor/BlockEditor';
import { AiImage, AiWriter } from '@/extensions';
import { Ai } from '@/extensions/Ai';
import { ExtensionKit } from '@/extensions/extension-kit';
import { randomElement } from '@/lib/utils/index';
import { TiptapCollabProvider, WebSocketStatus } from '@hocuspocus/provider';
import type { AnyExtension, Editor } from '@tiptap/core';
import { JSONContent } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { useEditor, useEditorState } from '@tiptap/react';
import { useEffect, useState } from 'react';
import type { Doc as YDoc } from 'yjs';

declare global {
  interface Window {
    editor: Editor | null;
  }
}

export const useBlockEditor = ({
  aiToken,
  ydoc,
  provider,
  document,
  userId,
  userName = 'Maxi',
}: {
  aiToken?: string;
  ydoc: YDoc;
  document?: JSONContent;
  provider?: TiptapCollabProvider | null | undefined;
  userId?: string;
  userName?: string;
}) => {
  const [collabState, setCollabState] = useState<WebSocketStatus>(
    provider ? WebSocketStatus.Connecting : WebSocketStatus.Disconnected
  );

  const editor = useEditor(
    {
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      autofocus: true,
      onCreate: async (ctx) => {
        if (provider && !provider.isSynced) {
          provider.on('synced', () => {
            setTimeout(() => {
              if (ctx.editor.isEmpty) {
                ctx.editor.commands.setContent(document || {});
              }
            }, 0);
          });
        } else if (ctx.editor.isEmpty) {
          const savedContent = localStorage.getItem('editorContent');
          if (savedContent) {
            ctx.editor.commands.setContent(JSON.parse(savedContent));
          } else if (document) {
            ctx.editor.commands.setContent(document || {});
          }
          ctx.editor.commands.focus('start', { scrollIntoView: true });
        }
      },
      extensions: [
        ...ExtensionKit({
          provider,
        }),
        provider
          ? Collaboration.configure({
              document: ydoc,
            })
          : undefined,
        provider
          ? CollaborationCursor.configure({
              provider,
              user: {
                name: randomElement(userNames),
                color: randomElement(userColors),
              },
            })
          : undefined,
        aiToken
          ? AiWriter.configure({
              authorId: userId,
              authorName: userName,
            })
          : undefined,
        aiToken
          ? AiImage.configure({
              authorId: userId,
              authorName: userName,
            })
          : undefined,
        aiToken ? Ai.configure({ token: aiToken }) : undefined,
      ].filter((e): e is AnyExtension => e !== undefined),
      editorProps: {
        attributes: {
          autocomplete: 'off',
          autocorrect: 'off',
          autocapitalize: 'off',
          class: 'min-h-screen bg-grey-100 max-w-[1500px] bg-grey-100  mx-auto',
        },
      },
    },
    [ydoc, provider]
  );

  const users = useEditorState({
    editor,
    selector: (ctx): (EditorUser & { initials: string })[] => {
      if (!ctx.editor?.storage.collaborationCursor?.users) {
        return [];
      }

      return ctx.editor.storage.collaborationCursor.users.map(
        (user: EditorUser) => {
          const names = user.name?.split(' ');
          const firstName = names?.[0];
          const lastName = names?.[names.length - 1];
          const initials = `${firstName?.[0] || '?'}${lastName?.[0] || '?'}`;

          return { ...user, initials: initials.length ? initials : '?' };
        }
      );
    },
  });

  useEffect(() => {
    const loadInitialContent = () => {
      if (editor && editor.isEmpty) {
        const savedContent = localStorage.getItem('editorContent');
        if (savedContent) {
          editor.commands.setContent(JSON.parse(savedContent));
        } else if (document) {
          editor.commands.setContent(document || {});
        }
      }
    };

    loadInitialContent();

    const saveContentToLocalStorage = () => {
      if (editor && !editor.isEmpty) {
        const content = editor.getJSON();
        localStorage.setItem('editorContent', JSON.stringify(content));
      }
    };

    editor?.on('update', saveContentToLocalStorage);

    return () => {
      editor?.off('update', saveContentToLocalStorage);
    };
  }, [editor, document]);

  useEffect(() => {
    provider?.on('status', (event: { status: WebSocketStatus }) => {
      setCollabState(event.status);
    });
  }, [provider]);

  window.editor = editor;

  return { editor, users, collabState };
};
