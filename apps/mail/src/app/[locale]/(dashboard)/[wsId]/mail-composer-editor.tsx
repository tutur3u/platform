'use client';

import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Undo2,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function MailComposerEditor({
  imageUrlToInsert,
  initialHtml,
  onImageInserted,
  onChange,
}: {
  imageUrlToInsert?: string | null;
  initialHtml: string;
  onImageInserted?: () => void;
  onChange: (value: { html: string; text: string }) => void;
}) {
  const t = useTranslations('mail');
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('https://');
  const editor = useEditor({
    content: initialHtml,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: t('write_message') }),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: nextEditor }) =>
      onChange({ html: nextEditor.getHTML(), text: nextEditor.getText() }),
  });

  useEffect(() => {
    if (!editor || editor.getHTML() === initialHtml) return;
    editor.commands.setContent(initialHtml, { emitUpdate: false });
  }, [editor, initialHtml]);

  useEffect(() => {
    if (!editor || !imageUrlToInsert) return;
    editor.chain().focus().setImage({ src: imageUrlToInsert }).run();
    onImageInserted?.();
  }, [editor, imageUrlToInsert, onImageInserted]);

  if (!editor)
    return <div className="min-h-56 animate-pulse bg-foreground/[0.025]" />;

  const applyLink = () => {
    const value = href.trim();
    if (!value) editor.chain().focus().unsetLink().run();
    else
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: value })
        .run();
    setLinkOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-0.5 border-dynamic border-b px-2 py-1.5">
        <ToolButton
          active={editor.isActive('bold')}
          label={t('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolButton>
        <ToolButton
          active={editor.isActive('italic')}
          label={t('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolButton>
        <ToolButton
          active={editor.isActive('bulletList')}
          label={t('bulleted_list')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolButton>
        <ToolButton
          active={editor.isActive('orderedList')}
          label={t('numbered_list')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolButton>
        <Popover onOpenChange={setLinkOpen} open={linkOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-label={t('link')}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Link2 className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-80 gap-2 p-2">
            <Input
              onChange={(event) => setHref(event.target.value)}
              value={href}
            />
            <Button onClick={applyLink} size="sm" type="button">
              {t('apply')}
            </Button>
          </PopoverContent>
        </Popover>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolButton
          label={t('undo')}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('redo')}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="size-4" />
        </ToolButton>
      </div>
      <EditorContent
        className="min-h-0 flex-1 overflow-y-auto [&_.ProseMirror]:min-h-56 [&_.ProseMirror]:px-4 [&_.ProseMirror]:py-3 [&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-6 [&_.ProseMirror]:outline-none [&_.is-editor-empty:first-child:before]:pointer-events-none [&_.is-editor-empty:first-child:before]:float-left [&_.is-editor-empty:first-child:before]:h-0 [&_.is-editor-empty:first-child:before]:text-muted-foreground [&_.is-editor-empty:first-child:before]:content-[attr(data-placeholder)]"
        editor={editor}
      />
    </div>
  );
}

function ToolButton({
  active,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className={cn(active && 'bg-accent')}
      onClick={onClick}
      size="icon"
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}
