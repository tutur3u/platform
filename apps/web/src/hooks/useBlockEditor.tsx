import { userColors, userNames } from '../lib/constants';
import type { EditorUser } from '@/components/components/BlockEditor/types';
import { AiImage, AiWriter } from '@/extensions';
import { Ai } from '@/extensions/Ai';
import MentionList, { MentionListRef } from '@/extensions/Mention/MentionList';
import { ExtensionKit } from '@/extensions/extension-kit';
import { randomElement } from '@/lib/utils/index';
import { TiptapCollabProvider, WebSocketStatus } from '@hocuspocus/provider';
import type { AnyExtension, Editor } from '@tiptap/core';
import { JSONContent } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Mention from '@tiptap/extension-mention';
import { useEditor, useEditorState } from '@tiptap/react';
import { ReactRenderer } from '@tiptap/react';
import { SuggestionKeyDownProps } from '@tiptap/suggestion';
import { useEffect, useState } from 'react';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import type { Doc as YDoc } from 'yjs';

declare global {
  interface Window {
    editor: Editor | null;
  }
}
interface MentionPluginProps {
  query: string;
  clientRect: DOMRect | null;
  editor: any;
  event: React.KeyboardEvent;
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
  // const [usernames, setUsernames] = useState<string[]>([]);

  // useEffect(() => {
  //   const fetchUsernames = async () => {
  //     try {
  //       const response = await fetch(`/api/v1/workspaces/${wsId}/Mention`);
  //       const data = await response.json();
  //       console.log(data, 'real data pls');
  //       if (data.email) {
  //         console.log(data.email, 'print out emails');
  //         console.log(data.email.length, 'length ');
  //         setUsernames(data.email);
  //       }
  //     } catch (error) {
  //       console.error('Error fetching usernames:', error);
  //     }
  //   };
  //   if (wsId) {
  //     fetchUsernames();
  //   }
  // }, [wsId]);
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
        Mention.configure({
          HTMLAttributes: {
            class:
              'bg-purple-100 rounded-md text-purple-600 px-1 py-0.5 break-words',
          },
          suggestion: {
            items: async ({ query }) => {
              // console.log(query, 'query')
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
                onStart: (props: MentionPluginProps): void => {
                  // Prevent issues when there's no clientRect available
                  if (!props.clientRect) {
                    console.error('No clientRect available for mention popup');
                    return;
                  }

                  // Render the mention list component
                  component = new ReactRenderer(MentionList, {
                    props,
                    editor: props.editor,
                  });

                  // Initialize the Tippy popup with proper settings
                  popup = tippy('body', {
                    getReferenceClientRect: props.clientRect,
                    appendTo: document?.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                  });
                },

                // onUpdate will update the popup when the query changes or the editor updates
                onUpdate: (props: MentionPluginProps): void => {
                  if (!props.clientRect) {
                    console.error('No clientRect on update');
                    return;
                  }

                  // Update the mention component props when the editor state changes
                  component?.updateProps(props);

                  // Update Tippy popup's position
                  if (popup[0]) {
                    popup[0].setProps({
                      getReferenceClientRect: () => {
                        return props.clientRect as DOMRect;
                      },
                    });
                  }
                },

                // onKeyDown will handle key events (e.g., Esc to close the popup)
                onKeyDown: (props: MentionPluginProps): boolean | undefined => {
                  // Close the popup if Escape key is pressed
                  if (props.event.key === 'Escape') {
                    popup[0]?.hide();
                    return true; // Stop the event from propagating further
                  }

                  // Ensure that component.ref is typed as MentionListRef so TypeScript can recognize onKeyDown
                  if (component?.ref) {
                    return (component.ref as MentionListRef).onKeyDown(props);
                  }

                  return undefined;
                },

                // onExit will clean up when the popup is destroyed (e.g., when the editor is destroyed or the user exits)
                onExit: (): void => {
                  // Ensure proper cleanup of popup and component
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
