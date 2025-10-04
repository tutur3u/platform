'use client';

import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Strike from '@tiptap/extension-strike';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Youtube from '@tiptap/extension-youtube';
import {
  type Editor,
  EditorContent,
  type JSONContent,
  Node,
  nodeInputRule,
  useEditor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { toast } from '@tuturuuu/ui/sonner';
import { debounce } from 'lodash';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ImageResize from 'tiptap-extension-resize-image';
import { ToolBar } from './tool-bar';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    video: {
      /**
       * Set a video node
       */
      setVideo: (src: string) => ReturnType;
      /**
       * Toggle a video
       */
      toggleVideo: (src: string) => ReturnType;
    };
  }
}

const VIDEO_INPUT_REGEX = /!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\)/;

const Video = Node.create({
  name: 'video',

  group: 'block',

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => (el as HTMLSpanElement).getAttribute('src'),
        renderHTML: (attrs) => ({ src: attrs.src }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'video',
        getAttrs: (el) => ({
          src: (el as HTMLVideoElement).getAttribute('src'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      { controls: 'true', style: 'width: 100%', ...HTMLAttributes },
      ['source', HTMLAttributes],
    ];
  },

  addCommands() {
    return {
      setVideo:
        (src: string) =>
        ({ commands }) =>
          commands.insertContent(
            `<video controls="true" style="width: 100%" src="${src}" />`
          ),

      toggleVideo:
        () =>
        ({ commands }) =>
          commands.toggleNode(this.name, 'paragraph'),
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: VIDEO_INPUT_REGEX,
        type: this.type,
        getAttributes: (match) => {
          const [, , src] = match;

          return { src };
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('videoDropPlugin'),

        props: {
          handleDOMEvents: {
            drop(view, event) {
              const {
                state: { schema, tr },
                dispatch,
              } = view;
              const hasFiles = event.dataTransfer?.files?.length;

              if (!hasFiles) return false;

              const videos = Array.from(event.dataTransfer.files).filter(
                (file) => /video/i.test(file.type)
              );

              if (videos.length === 0) return false;

              event.preventDefault();

              const coordinates = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });

              videos.forEach((video) => {
                const reader = new FileReader();

                reader.onload = (readerEvent) => {
                  const node = schema.nodes.video?.create({
                    src: readerEvent.target?.result,
                  });

                  if (!node) return;
                  if (coordinates && typeof coordinates.pos === 'number') {
                    const transaction = tr.insert(coordinates?.pos, node);
                    dispatch(transaction);
                  }
                };

                reader.readAsDataURL(video);
              });

              return true;
            },
          },
        },
      }),
    ];
  },
});

const Mention = Node.create({
  name: 'mention',

  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      userId: {
        default: null,
      },
      displayName: {
        default: null,
      },
      avatarUrl: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention="true"]',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          return {
            userId: element.dataset.userId ?? null,
            displayName: element.dataset.displayName ?? null,
            avatarUrl: element.dataset.avatarUrl ?? null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = { ...HTMLAttributes };
    const userId = (attrs.userId as string | null) ?? null;
    const displayNameRaw = (attrs.displayName as string | null) ?? null;
    const avatarUrl = (attrs.avatarUrl as string | null) ?? null;

    delete attrs.userId;
    delete attrs.displayName;
    delete attrs.avatarUrl;

    const displayName = (displayNameRaw || 'Member').trim();
    const initials = displayName
      .split(/\s+/)
      .map((part) => part?.[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || '??';

    const baseAttributes = {
      'data-mention': 'true',
      'data-user-id': userId ?? '',
      'data-display-name': displayName,
      'data-avatar-url': avatarUrl ?? '',
      class:
        'inline-flex items-center gap-1 rounded-full border border-dynamic-border bg-dynamic-surface px-2 py-0.5 text-[12px] font-medium text-foreground',
      ...attrs,
    };

    const avatarNode: any = avatarUrl
      ? [
          'span',
          {
            class:
              'relative -ml-0.5 h-4 w-4 overflow-hidden rounded-full border border-dynamic-border/60 bg-dynamic-surface/80',
          },
          ['img', { src: avatarUrl, alt: displayName, class: 'h-full w-full object-cover' }],
        ]
      : [
          'span',
          {
            class:
              'relative -ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-dynamic-surface/80 text-[10px] font-semibold uppercase text-foreground',
          },
          initials,
        ];

    return [
      'span',
      baseAttributes,
      avatarNode,
      ['span', { class: 'text-dynamic-blue' }, `@${displayName}`],
    ] as any;
  },

  addNodeView() {
    return ({ node }) => {
      let currentDisplayName =
        (node.attrs.displayName as string | null)?.trim() || 'Member';
      let currentAvatarUrl = node.attrs.avatarUrl as string | null;
      const userId = (node.attrs.userId as string | null) ?? '';

      const dom = document.createElement('span');
      dom.setAttribute('data-mention', 'true');
      dom.setAttribute('data-user-id', userId);
      dom.setAttribute('data-display-name', currentDisplayName);
      if (currentAvatarUrl) dom.setAttribute('data-avatar-url', currentAvatarUrl);
      dom.className =
        'inline-flex items-center gap-1 rounded-full border border-dynamic-border bg-dynamic-surface px-2 py-0.5 text-[12px] font-medium text-foreground';
      dom.contentEditable = 'false';

      const avatarWrapper = document.createElement('span');
      avatarWrapper.className =
        'relative -ml-0.5 flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border border-dynamic-border/60 bg-dynamic-surface/80 text-[10px] font-semibold uppercase text-foreground';

      if (currentAvatarUrl) {
        const img = document.createElement('img');
        img.src = currentAvatarUrl;
        img.alt = currentDisplayName;
        img.className = 'h-full w-full object-cover';
        img.referrerPolicy = 'no-referrer';
        avatarWrapper.textContent = '';
        avatarWrapper.appendChild(img);
      } else {
        const initials = currentDisplayName
          .split(/\s+/)
          .map((part) => part?.[0]?.toUpperCase() ?? '')
          .join('')
          .slice(0, 2) || '??';
        avatarWrapper.textContent = initials;
      }

      const label = document.createElement('span');
      label.className = 'text-dynamic-blue';
      label.textContent = `@${currentDisplayName}`;

      dom.appendChild(avatarWrapper);
      dom.appendChild(label);

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'mention') return false;
          const nextDisplayName =
            (updatedNode.attrs.displayName as string | null)?.trim() || 'Member';
          const nextAvatarUrl = updatedNode.attrs.avatarUrl as string | null;

          if (nextDisplayName !== currentDisplayName) {
            label.textContent = `@${nextDisplayName}`;
            dom.setAttribute('data-display-name', nextDisplayName);
            currentDisplayName = nextDisplayName;
          }

          if (nextAvatarUrl !== currentAvatarUrl) {
            if (nextAvatarUrl) {
              const img = document.createElement('img');
              img.src = nextAvatarUrl;
              img.alt = nextDisplayName;
              img.className = 'h-full w-full object-cover';
              img.referrerPolicy = 'no-referrer';
              avatarWrapper.textContent = '';
              avatarWrapper.appendChild(img);
              dom.setAttribute('data-avatar-url', nextAvatarUrl);
            } else {
              const nextInitials = nextDisplayName
                .split(/\s+/)
                .map((part) => part?.[0]?.toUpperCase() ?? '')
                .join('')
                .slice(0, 2) || '??';
              dom.removeAttribute('data-avatar-url');
              avatarWrapper.textContent = nextInitials;
            }
            currentAvatarUrl = nextAvatarUrl;
          }

          return true;
        },
        ignoreMutation() {
          return true;
        },
      };
    };
  },
});

const hasContent = (node: JSONContent): boolean => {
  // Check for text content
  if (node.text && node.text.trim().length > 0) return true;

  // Check for media content (images, videos, YouTube embeds, etc.)
  if (
    node.type &&
    ['image', 'imageResize', 'youtube', 'video', 'mention'].includes(node.type)
  ) {
    return true;
  }

  // Recursively check children
  if (node.content && node.content.length > 0) {
    return node.content.some((child: JSONContent) => hasContent(child));
  }

  // Empty paragraphs or empty doc should return false
  return false;
};

interface RichTextEditorProps {
  content: JSONContent | null;
  onChange?: (content: JSONContent | null) => void;
  readOnly?: boolean;
  titlePlaceholder?: string;
  writePlaceholder?: string;
  saveButtonLabel?: string;
  savedButtonLabel?: string;
  className?: string;
  workspaceId?: string;
  onImageUpload?: (file: File) => Promise<string>;
  flushPendingRef?: React.MutableRefObject<
    (() => JSONContent | null) | undefined
  >;
  onArrowUp?: (cursorOffset?: number) => void;
  onArrowLeft?: () => void;
  editorRef?: React.MutableRefObject<any>;
  initialCursorOffset?: number | null;
  onEditorReady?: (editor: Editor) => void;
}

export function RichTextEditor({
  content,
  onChange,
  readOnly = false,
  titlePlaceholder = 'What is the title?',
  writePlaceholder = 'Write something...',
  saveButtonLabel,
  savedButtonLabel,
  className,
  workspaceId,
  onImageUpload,
  flushPendingRef,
  onArrowUp,
  onArrowLeft,
  editorRef: externalEditorRef,
  initialCursorOffset,
  onEditorReady,
}: RichTextEditorProps) {
  const [hasChanges, setHasChanges] = useState(false);
  const [isUploadingPastedImage, setIsUploadingPastedImage] = useState(false);

  // Use refs to ensure we have stable references for handlers
  const onImageUploadRef = useRef(onImageUpload);
  const workspaceIdRef = useRef(workspaceId);
  const onChangeRef = useRef(onChange);
  const onArrowUpRef = useRef(onArrowUp);
  const onArrowLeftRef = useRef(onArrowLeft);
  const debouncedOnChangeRef = useRef<ReturnType<typeof debounce> | null>(null);

  useEffect(() => {
    onImageUploadRef.current = onImageUpload;
    workspaceIdRef.current = workspaceId;
    onChangeRef.current = onChange;
    onArrowUpRef.current = onArrowUp;
    onArrowLeftRef.current = onArrowLeft;
  }, [onImageUpload, workspaceId, onChange, onArrowUp, onArrowLeft]);

  const debouncedOnChange = useMemo(
    () =>
      debounce((newContent: JSONContent) => {
        onChangeRef.current?.(hasContent(newContent) ? newContent : null);
        setHasChanges(false);
      }, 500),
    []
  );

  // Store debounced function ref for flushing
  useEffect(() => {
    debouncedOnChangeRef.current = debouncedOnChange;
  }, [debouncedOnChange]);

  useEffect(() => {
    return () => {
      debouncedOnChange.cancel();
    };
  }, [debouncedOnChange]);

  const getEditorClasses = useMemo(() => {
    const baseClasses = [
      'border border-dynamic-border rounded-md bg-transparent',
      'prose dark:prose-invert max-w-none overflow-y-auto',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:content-[attr(data-placeholder)]',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:text-muted-foreground',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:float-left',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:h-0',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:pointer-events-none',
      '[&_li]:my-1 [&_li_h1]:text-4xl [&_li_h2]:text-3xl [&_li_h3]:text-2xl',
      className,
    ].filter(Boolean);
    return baseClasses.join(' ');
  }, [className]);

  const editor = useEditor({
    onCreate: ({ editor }) => {
      if (externalEditorRef) {
        externalEditorRef.current = editor;
      }
      onEditorReady?.(editor);
    },
    extensions: [
      StarterKit.configure({
        link: false,
        strike: false,
        bulletList: {
          HTMLAttributes: {
            class: 'list-disc ml-3',
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: 'list-decimal ml-3',
          },
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return titlePlaceholder;
          }
          return writePlaceholder;
        },
        emptyNodeClass: 'is-empty',
      }),
      Highlight,
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          class:
            'text-dynamic-blue hover:text-dynamic-blue/80 underline cursor-pointer transition-colors',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
        validate: (href) => {
          // Allow http/https URLs and mailto links
          return /^https?:\/\/.+/.test(href) || /^mailto:.+@.+\..+/.test(href);
        },
        protocols: ['http', 'https', 'mailto'],
        shouldAutoLink: () => {
          // Auto-link URLs but not in code blocks
          return true;
        },
      }),
      Strike,
      Subscript,
      Superscript,
      Mention,
      Image.configure({
        inline: true,
        allowBase64: false,
        HTMLAttributes: {
          class: 'rounded-md',
        },
      }),
      ImageResize.configure({
        inline: true,
        allowBase64: false,
        HTMLAttributes: {
          class: 'rounded-md',
        },
      }),
      Youtube.configure({
        controls: true,
        nocookie: true,
        width: 640,
        height: 360,
        HTMLAttributes: {
          class: 'rounded-md my-4',
        },
      }),
      Video.configure({
        HTMLAttributes: {
          class: 'rounded-md my-4',
        },
      }),
    ],
    content,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: getEditorClasses,
      },
      handleKeyDown: (view, event) => {
        // Prevent Ctrl+Enter / Cmd+Enter from creating a new line
        // Let the parent component handle the save action
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          return true;
        }

        const { state, dispatch } = view;
        const { selection } = state;
        const { $from } = selection;

        // Handle Backspace
        if (event.key === 'Backspace' && onArrowUpRef.current) {
          console.log('Backspace at pos:', $from.pos);

          // Check if we're on the first line
          const coordsAtCursor = view.coordsAtPos($from.pos);
          const coordsAtStart = view.coordsAtPos(1);
          const isOnFirstLine =
            coordsAtCursor &&
            coordsAtStart &&
            Math.abs(coordsAtCursor.top - coordsAtStart.top) < 5;

          console.log('Is on first line:', isOnFirstLine);

          if (isOnFirstLine) {
            const firstChild = state.doc.firstChild;
            console.log('First child:', {
              type: firstChild?.type.name,
              text: firstChild?.textContent,
              isEmpty: firstChild?.textContent.trim() === '',
              nodeSize: firstChild?.nodeSize,
            });

            // If cursor is at the absolute start (position 1)
            if ($from.pos === 1) {
              const firstChild = state.doc.firstChild;

              // If first line is empty and there's a second line, delete the empty line
              if (firstChild && firstChild.textContent.trim() === '') {
                const secondChild = state.doc.maybeChild(1);
                if (secondChild) {
                  console.log(
                    'Empty first line - manually deleting via commands'
                  );
                  event.preventDefault();

                  // Use commands to delete the node
                  const tr = state.tr;
                  const nodeSize = firstChild.nodeSize;

                  // Delete from position 0 to end of first child (including the node itself)
                  tr.delete(0, nodeSize);

                  // Dispatch and trigger onChange manually
                  dispatch(tr);

                  // Manually trigger onChange since we're in handleKeyDown
                  if (!readOnly && onChangeRef.current) {
                    const newJson = tr.doc.toJSON();
                    onChangeRef.current(hasContent(newJson) ? newJson : null);
                  }

                  return true;
                }
              }

              // If first line is NOT empty, go to title
              console.log('Non-empty first line - going to title');
              event.preventDefault();
              onArrowUpRef.current();
              return true;
            }
          }
        }

        // Handle ArrowUp when on the first line
        if (event.key === 'ArrowUp' && onArrowUpRef.current) {
          // Try to resolve a position one line up by checking textBetween
          // If we're at the very start of the document (pos 1), go to title
          if ($from.pos === 1) {
            event.preventDefault();
            onArrowUpRef.current(0); // At the start, offset is 0
            return true;
          }

          // Check if we're in a position where up arrow won't move us
          // This happens when we're on the first line of the first block
          const coordsAtCursor = view.coordsAtPos($from.pos);
          const coordsAtStart = view.coordsAtPos(1);

          // If cursor is on the same line as the start, go to title
          if (
            coordsAtCursor &&
            coordsAtStart &&
            Math.abs(coordsAtCursor.top - coordsAtStart.top) < 5
          ) {
            event.preventDefault();

            // Calculate character offset from start of the first line
            // Position 1 is the start of the document, $from.pos is current cursor
            // Since we're on the first line, the offset is simply the distance from position 1
            const offset = $from.pos - 1;

            onArrowUpRef.current(offset);
            return true;
          }
        }

        // Handle ArrowLeft when at the very start of the document
        if (event.key === 'ArrowLeft' && onArrowLeftRef.current) {
          // If we're at position 1 (start of document), go back to title
          if ($from.pos === 1) {
            event.preventDefault();
            onArrowLeftRef.current();
            return true;
          }
        }

        return false;
      },
      handlePaste: (view, event) => {
        // Handle image and video paste
        const items = event.clipboardData?.items;
        if (!items || !onImageUploadRef.current || !workspaceIdRef.current)
          return false;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item) continue;

          // Debug: Log the MIME type to console
          console.log('Pasted item type:', item.type);

          const isImage = item.type.startsWith('image/');
          const isVideo = item.type.startsWith('video/');

          if (isImage || isVideo) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;

            console.log('Detected file:', {
              name: file.name,
              type: file.type,
              size: file.size,
              isImage,
              isVideo,
            });

            // Validate file size (max 50MB for videos, 5MB for images)
            const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
            if (file.size > maxSize) {
              toast.error(
                isVideo
                  ? 'Video size must be less than 50MB'
                  : 'Image size must be less than 5MB'
              );
              return true;
            }

            // Upload file asynchronously
            setIsUploadingPastedImage(true);
            onImageUploadRef
              .current(file)
              .then((url) => {
                const { state } = view;
                const { from } = state.selection;

                if (isImage) {
                  // ImageResize extension uses 'imageResize' node name
                  const imageNode =
                    state.schema.nodes.imageResize || state.schema.nodes.image;
                  if (imageNode) {
                    const transaction = state.tr.insert(
                      from,
                      imageNode.create({ src: url })
                    );
                    view.dispatch(transaction);
                    toast.success('Image uploaded successfully');
                  } else {
                    console.error(
                      'Available nodes:',
                      Object.keys(state.schema.nodes)
                    );
                    toast.error('Image node not found');
                  }
                } else if (isVideo) {
                  // Video node
                  const videoNode = state.schema.nodes.video;
                  if (videoNode) {
                    const transaction = state.tr.insert(
                      from,
                      videoNode.create({ src: url })
                    );
                    view.dispatch(transaction);
                    toast.success('Video uploaded successfully');
                  } else {
                    console.error(
                      'Available nodes:',
                      Object.keys(state.schema.nodes)
                    );
                    toast.error('Video node not found');
                  }
                }
              })
              .catch((error) => {
                console.error('Failed to upload pasted file:', error);
                toast.error(
                  `Failed to upload ${isVideo ? 'video' : 'image'}. Please try again.`
                );
              })
              .finally(() => {
                setIsUploadingPastedImage(false);
              });

            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (!readOnly) {
        setHasChanges(true);
        debouncedOnChange(editor.getJSON());
      }
    },
  });

  // Update editor's editable state when readOnly prop changes
  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Handle initial cursor positioning when focusing from title
  useEffect(() => {
    if (
      editor &&
      initialCursorOffset !== null &&
      initialCursorOffset !== undefined
    ) {
      // Use requestAnimationFrame to ensure editor is fully ready
      requestAnimationFrame(() => {
        try {
          const doc = editor.state.doc;
          const firstNode = doc.firstChild;

          if (firstNode) {
            // Calculate position: 1 (start of doc) + offset within first line
            // Cap it at the length of the first text node
            const firstTextLength = firstNode.textContent.length;
            const actualOffset = Math.min(initialCursorOffset, firstTextLength);
            const newPos = Math.max(
              1,
              Math.min(1 + actualOffset, doc.content.size - 1)
            );

            // Create a text selection at the target position
            const tr = editor.state.tr.setSelection(
              TextSelection.near(doc.resolve(newPos))
            );
            editor.view.dispatch(tr);
          }
        } catch (error) {
          console.error('Error setting cursor position:', error);
        }
      });
    }
  }, [editor, initialCursorOffset]);

  const handleSave = useCallback(() => {
    if (editor && !readOnly) {
      setHasChanges(true);
      debouncedOnChange(editor.getJSON());
    }
  }, [editor, readOnly, debouncedOnChange]);

  // Expose flush method via ref - returns current content
  useEffect(() => {
    if (!flushPendingRef || !editor) return;

    flushPendingRef.current = () => {
      // Flush pending debounced changes immediately
      if (debouncedOnChangeRef.current) {
        debouncedOnChangeRef.current.flush();
      }
      // Get current editor content
      const currentContent = editor.getJSON();
      const finalContent = hasContent(currentContent) ? currentContent : null;

      // Also call onChange to update parent state
      onChangeRef.current?.(finalContent);

      // Return the content so caller can use it immediately
      return finalContent;
    };
  }, [editor, flushPendingRef]);

  return (
    <div className="group relative h-full">
      {!readOnly && (
        <ToolBar
          editor={editor}
          hasChanges={hasChanges}
          onSave={handleSave}
          saveButtonLabel={saveButtonLabel}
          savedButtonLabel={savedButtonLabel}
          workspaceId={workspaceId}
          onImageUpload={onImageUpload}
        />
      )}
      <EditorContent editor={editor} className="h-full" />
      {isUploadingPastedImage && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2 shadow-lg">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-dynamic-orange border-t-transparent" />
            <span className="text-sm">Uploading media...</span>
          </div>
        </div>
      )}
    </div>
  );
}
