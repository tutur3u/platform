'use client';

import { ToolBar } from './tool-bar';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Strike from '@tiptap/extension-strike';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { EditorContent, type JSONContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { debounce } from 'lodash';
import { useCallback, useEffect, useMemo, useState } from 'react';

const isContentEmpty = (content: JSONContent) => {
  if (!content || !content.content) return true;

  if (content.content.length === 0) return true;

  if (content.content.length === 1) {
    const firstNode = content.content[0];
    if (
      firstNode?.type === 'paragraph' &&
      (!firstNode.content || firstNode.content.length === 0)
    ) {
      return true;
    }
  }

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
}: RichTextEditorProps) {
  const [hasChanges, setHasChanges] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedOnChange = useCallback(
    debounce((newContent: JSONContent) => {
      onChange?.(isContentEmpty(newContent) ? null : newContent);
      setHasChanges(false);
    }, 500),
    [onChange]
  );

  useEffect(() => {
    return () => {
      debouncedOnChange.cancel();
    };
  }, [debouncedOnChange]);

  const getEditorClasses = useMemo(() => {
    const baseClasses = [
      'border rounded-md bg-white dark:bg-foreground/5 py-2 px-3',
      'prose dark:prose-invert max-w-none overflow-y-auto ',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:content-[attr(data-placeholder)]',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:text-gray-400',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:float-left',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:h-0',
      '[&_*:is(p,h1,h2,h3).is-empty::before]:pointer-events-none',
      '[&_li]:my-1 [&_li_h1]:text-4xl [&_li_h2]:text-3xl [&_li_h3]:text-2xl',
      className,
    ];
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
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          class:
            'text-blue-600 hover:text-blue-800 underline cursor-pointer transition-colors',
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
    ],
    content,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: getEditorClasses,
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
    if (editor) {
      editor.commands.setContent(content);
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly, content]);

  const handleSave = useCallback(() => {
    if (editor && !readOnly) {
      setHasChanges(true);
      debouncedOnChange(editor.getJSON());
    }
  }, [editor, readOnly, debouncedOnChange]);

  return (
    <div className={`space-y-2`}>
      {!readOnly && (
        <ToolBar
          editor={editor}
          hasChanges={hasChanges}
          onSave={handleSave}
          saveButtonLabel={saveButtonLabel}
          savedButtonLabel={savedButtonLabel}
        />
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
