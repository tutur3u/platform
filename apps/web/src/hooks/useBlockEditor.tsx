// import { userColors, userNames } from '../lib/constants';
import type { EditorUser } from '@/components/components/BlockEditor/types';
import { AiImage, AiWriter, StarterKit } from '@/extensions';
import { Ai } from '@/extensions/Ai';
import MentionList, { MentionListRef } from '@/extensions/Mention/MentionList';
import { ExtensionKit } from '@/extensions/extension-kit';
// import { randomElement } from '@/lib/utils/index';
import { TiptapCollabProvider, WebSocketStatus } from '@hocuspocus/provider';
import { useLiveblocksExtension } from '@liveblocks/react-tiptap';
import type { AnyExtension, Editor } from '@tiptap/core';
import { JSONContent } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Mention from '@tiptap/extension-mention';
import { useEditor, useEditorState } from '@tiptap/react';
import { ReactRenderer } from '@tiptap/react';
import { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { useEffect, useState } from 'react';
import { KeyboardEvent as ReactKeyboardEvent } from 'react';
import tippy, {
  GetReferenceClientRect,
  Instance as TippyInstance,
} from 'tippy.js';
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
  wsId,
}: {
  aiToken?: string;
  ydoc: YDoc;
  document?: JSONContent;
  provider?: TiptapCollabProvider | null | undefined;
  userId?: string;
  userName?: string;
  wsId?: string | undefined | null;
}) => {
  const [collabState, setCollabState] = useState<WebSocketStatus>(
    provider ? WebSocketStatus.Connecting : WebSocketStatus.Disconnected
  );
  const liveblocks = useLiveblocksExtension();

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
        liveblocks,
        StarterKit.configure({
          history:false,
        }),

        Mention.configure({
          HTMLAttributes: {
            class:
              'bg-purple-100 rounded-md text-purple-600 px-1 py-0.5 break-words',
          },
          suggestion: {
            items: async ({ query }) => {
              // Filter the list of names based on the user's query
              const response = await fetch(
                `/api/v1/workspaces/${wsId}/Mention`
              );
              const data = await response.json();
              console.log(data, 'data in item');
              console.log(data.email, 'email in item');

              if (data.email.length === 0) {
                return [];
              }
              return data.email
                .filter((item: any) =>
                  item.toLowerCase().startsWith(query.toLowerCase())
                ) // Filter dynamic data based on query
                .slice(0, 5);
            },

            render: () => {
              let component: ReactRenderer | null = null;
              let popup: TippyInstance[] = [];

              return {
                onStart: (props: SuggestionProps<any, any>): void => {
                  if (!props.clientRect) {
                    console.error('No clientRect available for mention popup');
                    return;
                  }

                  component = new ReactRenderer(MentionList, {
                    props,
                    editor: props.editor,
                  });

                  popup = tippy('body', {
                    getReferenceClientRect:
                      props.clientRect as unknown as GetReferenceClientRect,
                    appendTo: document?.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                  });
                },

                onUpdate: (props: SuggestionProps<any, any>): void => {
                  if (!props.clientRect) {
                    console.error('No clientRect on update');
                    return;
                  }

                  component?.updateProps(props);

                  if (popup[0]) {
                    popup[0].setProps({
                      getReferenceClientRect: () => {
                        return props.clientRect as unknown as DOMRect;
                      },
                    });
                  }
                },

                onKeyDown: (props: SuggestionKeyDownProps): boolean => {
                  const event: ReactKeyboardEvent = props.event as any;

                  if (event.key === 'Escape') {
                    popup[0]?.hide();
                    return true; // Stop propagation
                  }

                  if (component?.ref) {
                    const handled = (component.ref as MentionListRef).onKeyDown(
                      {
                        event,
                      }
                    );
                    return handled === undefined ? false : handled;
                  }

                  return false;
                },

                onExit: (): void => {
                  if (popup[0]) {
                    popup[0].destroy();
                  }
                  if (component) {
                    component.destroy();
                  }
                },
              };
            },
          },
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
                // name: randomElement(userNames),
                // color: randomElement(userColors),
                name: 'Maxi',
                color: '#000000',
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
