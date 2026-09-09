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
  Sparkles,
  Undo2,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { splitComposerQuote } from './mail-composer-quote';
import {
  type ComposerSelection,
  captureComposerSelection,
} from './mail-composer-selection';
import { mailHtmlToText } from './mail-composer-utils';
import { MailMessagePreview } from './mail-message-preview';

export function MailComposerEditor({
  imageUrlToInsert,
  initialHtml,
  onImageInserted,
  onChange,
  onSelectionChange,
  onEnhance,
}: {
  imageUrlToInsert?: string | null;
  initialHtml: string;
  onSelectionChange: (selection: ComposerSelection | null) => void;
  onEnhance: () => void;
  onImageInserted?: () => void;
  onChange: (value: { html: string; text: string }) => void;
}) {
  const t = useTranslations('mail');
  const parts = useMemo(() => splitComposerQuote(initialHtml), [initialHtml]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('https://');
  const editor = useEditor({
    content: parts.authored,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: t('write_message') }),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: nextEditor }) => {
      const html = nextEditor.getHTML() + parts.quoted;
      onChange({ html, text: mailHtmlToText(html) });
      onSelectionChange(null);
    },
    onSelectionUpdate: ({ editor: current }) => {
      const selection = captureComposerSelection(current);
      setHasSelection(Boolean(selection));
      onSelectionChange(selection);
    },
  });

  useEffect(() => {
    if (!editor || editor.getHTML() === parts.authored) return;
    editor.commands.setContent(parts.authored, { emitUpdate: false });
  }, [editor, parts.authored]);

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
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-dynamic border-b bg-muted/20 px-3 py-1">
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
        {hasSelection && (
          <Button
            className="ml-auto gap-1"
            size="sm"
            variant="secondary"
            type="button"
            onClick={onEnhance}
          >
            <Sparkles className="size-3.5" />
            {t('enhance_selection')}
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent
          className="[&_.ProseMirror]:min-h-56 [&_.ProseMirror]:px-5 [&_.ProseMirror]:py-5 [&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-6 [&_.ProseMirror]:outline-none [&_.ProseMirror_a]:underline [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_p]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.is-editor-empty:first-child:before]:pointer-events-none [&_.is-editor-empty:first-child:before]:float-left [&_.is-editor-empty:first-child:before]:h-0 [&_.is-editor-empty:first-child:before]:text-muted-foreground [&_.is-editor-empty:first-child:before]:content-[attr(data-placeholder)]"
          editor={editor}
        />
        {parts.quoted && (
          <details
            className="mx-5 mb-5"
            open={quoteOpen}
            onToggle={(event) => setQuoteOpen(event.currentTarget.open)}
          >
            <summary className="w-fit cursor-pointer rounded-md border px-2 py-1 text-muted-foreground text-xs hover:text-foreground">
              {t('quoted_text')}
            </summary>
            {quoteOpen && (
              <MailMessagePreview
                content={parts.quoted}
                attachments={[]}
                title={t('quoted_text')}
              />
            )}
          </details>
        )}
      </div>
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
