'use client';

import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Strike from '@tiptap/extension-strike';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Youtube from '@tiptap/extension-youtube';
import { EditorContent, type JSONContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageResize from 'tiptap-extension-resize-image';
import { toast } from '@tuturuuu/ui/sonner';
import { debounce } from 'lodash';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToolBar } from './tool-bar';

const hasContent = (node: JSONContent): boolean => {
  // Check for text content
  if (node.text && node.text.trim().length > 0) return true;

  // Check for media content (images, videos, YouTube embeds, etc.)
  if (
    node.type &&
    ['image', 'imageResize', 'youtube', 'video'].includes(node.type)
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
}: RichTextEditorProps) {
  const [hasChanges, setHasChanges] = useState(false);
  const [isUploadingPastedImage, setIsUploadingPastedImage] = useState(false);

  // Use refs to ensure we have stable references for handlers
  const onImageUploadRef = useRef(onImageUpload);
  const workspaceIdRef = useRef(workspaceId);
  const onChangeRef = useRef(onChange);
  const debouncedOnChangeRef = useRef<ReturnType<typeof debounce> | null>(null);

  useEffect(() => {
    onImageUploadRef.current = onImageUpload;
    workspaceIdRef.current = workspaceId;
    onChangeRef.current = onChange;
  }, [onImageUpload, workspaceId, onChange]);

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
    ],
    content,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: getEditorClasses,
      },
      handleKeyDown: (_, event) => {
        // Prevent Ctrl+Enter / Cmd+Enter from creating a new line
        // Let the parent component handle the save action
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        // Handle image paste
        const items = event.clipboardData?.items;
        if (!items || !onImageUploadRef.current || !workspaceIdRef.current)
          return false;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item?.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;

            // Validate file size (max 5MB)
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
              toast.error('Image size must be less than 5MB');
              return true;
            }

            // Upload image asynchronously
            setIsUploadingPastedImage(true);
            onImageUploadRef
              .current(file)
              .then((url) => {
                const { state } = view;
                const { from } = state.selection;
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
              })
              .catch((error) => {
                console.error('Failed to upload pasted image:', error);
                toast.error('Failed to upload image. Please try again.');
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
            <span className="text-sm">Uploading image...</span>
          </div>
        </div>
      )}
    </div>
  );
}
