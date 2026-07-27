'use client';

import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Undo2,
} from '@tuturuuu/icons';
import type { ComponentType, SVGProps } from 'react';
import { useMemo } from 'react';
import { extractPlainText } from './codec.js';
import { editorMessages } from './messages.js';
import type { EditorLocale, EditorMessages, JSONContent } from './types.js';

type ToolbarIcon = ComponentType<SVGProps<SVGSVGElement>>;

function ToolbarAction({
  active = false,
  icon: Icon,
  label,
  run,
}: {
  active?: boolean;
  icon: ToolbarIcon;
  label: string;
  run: () => void;
}) {
  return (
    <span className="tuturuuu-editor-tool">
      <button
        aria-label={label}
        aria-pressed={active ?? undefined}
        onClick={run}
        type="button"
      >
        <Icon aria-hidden="true" />
      </button>
      <span className="tuturuuu-editor-tooltip" role="tooltip">
        {label}
      </span>
    </span>
  );
}

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
  const action = (
    label: string,
    icon: ToolbarIcon,
    run: () => void,
    active?: boolean
  ) => (
    <ToolbarAction
      active={active}
      icon={icon}
      key={label}
      label={label}
      run={run}
    />
  );
  const words = extractPlainText(editor.getJSON())
    .split(/\s+/u)
    .filter(Boolean).length;

  return (
    <div className="tuturuuu-editor" data-read-only={readOnly || undefined}>
      {!readOnly ? (
        <div
          aria-label={messages.toolbar}
          className="tuturuuu-editor-toolbar"
          role="toolbar"
        >
          {action(
            messages.bold,
            Bold,
            () => editor.chain().focus().toggleBold().run(),
            editor.isActive('bold')
          )}
          {action(
            messages.italic,
            Italic,
            () => editor.chain().focus().toggleItalic().run(),
            editor.isActive('italic')
          )}
          {action(
            messages.heading,
            Heading2,
            () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            editor.isActive('heading')
          )}
          {action(
            messages.bulletList,
            List,
            () => editor.chain().focus().toggleBulletList().run(),
            editor.isActive('bulletList')
          )}
          {action(
            messages.orderedList,
            ListOrdered,
            () => editor.chain().focus().toggleOrderedList().run(),
            editor.isActive('orderedList')
          )}
          {action(
            messages.blockquote,
            Quote,
            () => editor.chain().focus().toggleBlockquote().run(),
            editor.isActive('blockquote')
          )}
          {action(messages.horizontalRule, Minus, () =>
            editor.chain().focus().setHorizontalRule().run()
          )}
          {action(messages.link, Link2, () => {
            const href = window.prompt(messages.link);
            if (href) editor.chain().focus().setLink({ href }).run();
          })}
          {onImageUpload ? (
            <span className="tuturuuu-editor-tool">
              <label aria-label={messages.image}>
                <ImagePlus aria-hidden="true" />
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
              <span className="tuturuuu-editor-tooltip" role="tooltip">
                {messages.image}
              </span>
            </span>
          ) : null}
          <span
            aria-hidden="true"
            className="tuturuuu-editor-toolbar-separator"
          />
          {action(messages.undo, Undo2, () =>
            editor.chain().focus().undo().run()
          )}
          {action(messages.redo, Redo2, () =>
            editor.chain().focus().redo().run()
          )}
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
