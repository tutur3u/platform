'use client';

import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Check,
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
  X,
} from '@tuturuuu/icons';
import type { ComponentType, SVGProps } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { extractPlainText } from './codec.js';
import { editorMessages } from './messages.js';
import type { EditorLocale, EditorMessages, JSONContent } from './types.js';

type ToolbarIcon = ComponentType<SVGProps<SVGSVGElement>>;

function ToolbarAction({
  active,
  icon: Icon,
  label,
  run,
  type = 'button',
}: {
  active?: boolean;
  icon: ToolbarIcon;
  label: string;
  run?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <span className="tuturuuu-editor-tool">
      <button
        aria-label={label}
        aria-pressed={active}
        onClick={run}
        type={type}
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkHref, setLinkHref] = useState('');
  const messages = useMemo(
    () => ({ ...editorMessages[locale], ...messageOverrides }),
    [locale, messageOverrides]
  );
  useEffect(() => {
    if (linkEditorOpen) linkInputRef.current?.focus();
  }, [linkEditorOpen]);
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
          <div className="tuturuuu-editor-link-control">
            {action(
              messages.link,
              Link2,
              () => {
                const currentHref = editor.getAttributes('link').href;
                setLinkHref(typeof currentHref === 'string' ? currentHref : '');
                setLinkEditorOpen((open) => !open);
              },
              editor.isActive('link')
            )}
            {linkEditorOpen ? (
              <form
                className="tuturuuu-editor-link-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const href = linkHref.trim();
                  const chain = editor.chain().focus().extendMarkRange('link');
                  if (href) chain.setLink({ href }).run();
                  else chain.unsetLink().run();
                  setLinkEditorOpen(false);
                }}
              >
                <input
                  aria-label={messages.link}
                  inputMode="url"
                  onChange={(event) => setLinkHref(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setLinkEditorOpen(false);
                  }}
                  placeholder={messages.linkPlaceholder}
                  ref={linkInputRef}
                  type="text"
                  value={linkHref}
                />
                <ToolbarAction
                  icon={Check}
                  label={messages.applyLink}
                  type="submit"
                />
                <ToolbarAction
                  icon={X}
                  label={messages.cancel}
                  run={() => setLinkEditorOpen(false)}
                />
              </form>
            ) : null}
          </div>
          {onImageUpload ? (
            <span className="tuturuuu-editor-tool">
              <button
                aria-label={messages.image}
                onClick={() => imageInputRef.current?.click()}
                type="button"
              >
                <ImagePlus aria-hidden="true" />
              </button>
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
                  event.currentTarget.value = '';
                }}
                ref={imageInputRef}
                type="file"
              />
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
