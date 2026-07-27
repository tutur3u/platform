'use client';

import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useMemo } from 'react';
import { extractPlainText } from './codec.js';
import { editorMessages } from './messages.js';
import type { EditorLocale, EditorMessages, JSONContent } from './types.js';

export function RichTextEditor({
  content,
  locale = 'en',
  messages: messageOverrides,
  onChange,
  onImageUpload,
  placeholder,
  readOnly = false,
}: {
  content: JSONContent | null;
  locale?: EditorLocale;
  messages?: Partial<Omit<EditorMessages, 'words'>>;
  onChange?: (content: JSONContent | null) => void;
  onImageUpload?: (file: File) => Promise<string>;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const messages = useMemo(
    () => ({ ...editorMessages[locale], ...messageOverrides }),
    [locale, messageOverrides]
  );
  const editor = useEditor({
    content: content ?? { type: 'doc', content: [] },
    editable: !readOnly,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: readOnly }),
      Image,
      Placeholder.configure({
        placeholder: placeholder ?? messages.placeholder,
      }),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange?.(current.getJSON()),
  });

  if (!editor)
    return <div aria-busy="true" className="tuturuuu-editor-skeleton" />;
  const action = (label: string, run: () => void, active = false) => (
    <button aria-pressed={active} onClick={run} type="button">
      {label}
    </button>
  );
  const words = extractPlainText(editor.getJSON())
    .split(/\s+/u)
    .filter(Boolean).length;

  return (
    <div className="tuturuuu-editor" data-read-only={readOnly || undefined}>
      {!readOnly ? (
        <div
          aria-label="Formatting"
          className="tuturuuu-editor-toolbar"
          role="toolbar"
        >
          {action(
            messages.bold,
            () => editor.chain().focus().toggleBold().run(),
            editor.isActive('bold')
          )}
          {action(
            messages.italic,
            () => editor.chain().focus().toggleItalic().run(),
            editor.isActive('italic')
          )}
          {action(
            messages.heading,
            () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            editor.isActive('heading')
          )}
          {action(
            messages.bulletList,
            () => editor.chain().focus().toggleBulletList().run(),
            editor.isActive('bulletList')
          )}
          {action(
            messages.orderedList,
            () => editor.chain().focus().toggleOrderedList().run(),
            editor.isActive('orderedList')
          )}
          {action(
            messages.blockquote,
            () => editor.chain().focus().toggleBlockquote().run(),
            editor.isActive('blockquote')
          )}
          {action(messages.horizontalRule, () =>
            editor.chain().focus().setHorizontalRule().run()
          )}
          {action(messages.link, () => {
            const href = window.prompt(messages.link);
            if (href) editor.chain().focus().setLink({ href }).run();
          })}
          {onImageUpload ? (
            <label>
              {messages.image}
              <input
                accept="image/*"
                hidden
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file)
                    editor
                      .chain()
                      .focus()
                      .setImage({ src: await onImageUpload(file) })
                      .run();
                }}
                type="file"
              />
            </label>
          ) : null}
          {action(messages.undo, () => editor.chain().focus().undo().run())}
          {action(messages.redo, () => editor.chain().focus().redo().run())}
        </div>
      ) : null}
      <EditorContent editor={editor} />
      {!readOnly ? (
        <output className="tuturuuu-editor-word-count">
          {editorMessages[locale].words(words)}
        </output>
      ) : null}
    </div>
  );
}

export type { JSONContent } from './types.js';
