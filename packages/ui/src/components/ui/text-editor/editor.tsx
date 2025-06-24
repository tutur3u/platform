'use client';

import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { EditorContent, type JSONContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { debounce } from 'lodash';
import { useCallback, useEffect, useState } from 'react';
import { ToolBar } from './tool-bar';

interface RichTextEditorProps {
  content: JSONContent | null;
  onChange?: (content: JSONContent) => void;
  readOnly?: boolean;
  titlePlaceholder?: string;
  writePlaceholder?: string;
  saveButtonLabel?: string;
  savedButtonLabel?: string;
}

const getEditorClasses = (readOnly: boolean) => {
  const baseClasses = [
    readOnly ? 'h-full' : 'h-[calc(100vh-8rem)]',
    'border rounded-md bg-white dark:bg-foreground/5 py-2 px-3',
    'prose dark:prose-invert max-w-none overflow-y-auto',
    '[&_*:is(p,h1,h2,h3).is-empty::before]:content-[attr(data-placeholder)]',
    '[&_*:is(p,h1,h2,h3).is-empty::before]:text-gray-400',
    '[&_*:is(p,h1,h2,h3).is-empty::before]:float-left',
    '[&_*:is(p,h1,h2,h3).is-empty::before]:h-0',
    '[&_*:is(p,h1,h2,h3).is-empty::before]:pointer-events-none',
    '[&_li]:my-1 [&_li_h1]:text-4xl [&_li_h2]:text-3xl [&_li_h3]:text-2xl',
  ];
  return baseClasses.join(' ');
};

export function RichTextEditor({
  content,
  onChange,
  readOnly = false,
  titlePlaceholder = 'What is the title?',
  writePlaceholder = 'Write something...',
  saveButtonLabel = 'Save',
  savedButtonLabel = 'Saved',
}: RichTextEditorProps) {
  const [hasChanges, setHasChanges] = useState(false);

  const debouncedOnChange = useCallback(
    debounce((newContent: JSONContent) => {
      onChange?.(newContent);
      setHasChanges(false);
    }, 500),
    []
  );

  useEffect(() => {
    return () => {
      debouncedOnChange.cancel();
    };
  }, [debouncedOnChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
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
    ],
    content: content || '',
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: getEditorClasses(readOnly),
      },
    },
    onUpdate: ({ editor }) => {
      if (!readOnly) {
        setHasChanges(true);
        debouncedOnChange(editor.getJSON());
      }
    },
  });

  const handleSave = useCallback(() => {
    if (editor && !readOnly) {
      onChange?.(editor.getJSON());
      setHasChanges(false);
    }
  }, [editor, onChange, readOnly]);

  return (
    <div
      className={`flex ${readOnly ? 'h-full' : 'h-[calc(100vh-4rem)]'} flex-col`}
    >
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
