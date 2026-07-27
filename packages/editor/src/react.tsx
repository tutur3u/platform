'use client';

import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react';
import { useMemo } from 'react';
import { extractPlainText } from './codec.js';
import { ImageUploadControl } from './image-upload-control.js';
import { LinkToolbarControl } from './link-toolbar-control.js';
import { editorMessages } from './messages.js';
import type { ToolbarIcon } from './toolbar-action.js';
import { ToolbarAction } from './toolbar-action.js';
import type { EditorLocale, EditorMessages, JSONContent } from './types.js';

export function RichTextEditor({
  content,
  locale = 'en',
  messages: messageOverrides,
  onChange,
  onImageUpload,
  onImageUploadError,
  placeholder,
  readOnly = false,
}: {
  content: JSONContent | null;
  locale?: EditorLocale;
  messages?: Partial<Omit<EditorMessages, 'words'>>;
  onChange?: (content: JSONContent | null) => void;
  onImageUpload?: (file: File) => Promise<string>;
  onImageUploadError?: (error: unknown) => void;
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
      StarterKit.configure({ link: false }),
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
  const headingLabels = {
    1: messages.heading1 ?? `${messages.heading} 1`,
    2: messages.heading2 ?? `${messages.heading} 2`,
    3: messages.heading3 ?? `${messages.heading} 3`,
  } as const;

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
            headingLabels[1],
            Heading1,
            () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
            editor.isActive('heading', { level: 1 })
          )}
          {action(
            headingLabels[2],
            Heading2,
            () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            editor.isActive('heading', { level: 2 })
          )}
          {action(
            headingLabels[3],
            Heading3,
            () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
            editor.isActive('heading', { level: 3 })
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
          <LinkToolbarControl
            active={editor.isActive('link')}
            currentHref={() => {
              const currentHref = editor.getAttributes('link').href;
              return typeof currentHref === 'string' ? currentHref : '';
            }}
            messages={messages}
            onApply={(href) => {
              const chain = editor.chain().focus().extendMarkRange('link');
              if (href) chain.setLink({ href }).run();
              else chain.unsetLink().run();
            }}
          />
          {onImageUpload ? (
            <ImageUploadControl
              label={messages.image}
              onError={onImageUploadError}
              onInsert={(src) => editor.chain().focus().setImage({ src }).run()}
              onUpload={onImageUpload}
            />
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
