'use client';

import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline as UnderlineIcon,
  Unlink,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useMemo, useState } from 'react';

import { markdownToRichTextHtml } from './content';
import type { getFormToneClasses } from './theme';

function ToolbarButton({
  active = false,
  onClick,
  disabled,
  children,
  toneClasses,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  title: string;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-8 w-8 rounded-xl border border-transparent',
        active
          ? toneClasses.selectedOptionClassName
          : 'text-muted-foreground hover:border-border/60 hover:bg-background/70 hover:text-foreground'
      )}
    >
      {children}
    </Button>
  );
}

function setEditorLink(editor: Editor, href: string) {
  const trimmedHref = href.trim();

  if (!trimmedHref) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }

  editor
    .chain()
    .focus()
    .extendMarkRange('link')
    .setLink({
      href: trimmedHref,
      target: '_blank',
      rel: 'noopener noreferrer',
    })
    .run();
}

export function FormsRichTextEditor({
  value,
  onChange,
  placeholder,
  toneClasses,
  compact = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  compact?: boolean;
  className?: string;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [isEmpty, setIsEmpty] = useState(!value.trim());
  const resolvedHtml = useMemo(() => markdownToRichTextHtml(value), [value]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        autolink: true,
        openOnClick: false,
        defaultProtocol: 'https',
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
    ],
    content: resolvedHtml || '<p></p>',
    onCreate: ({ editor }) => {
      setIsEmpty(editor.isEmpty);
    },
    onUpdate: ({ editor }) => {
      setIsEmpty(editor.isEmpty);
      onChange(editor.isEmpty ? '' : editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextContent = resolvedHtml || '<p></p>';
    if (editor.getHTML() === nextContent) {
      return;
    }

    editor.commands.setContent(nextContent);
    setIsEmpty(editor.isEmpty);
  }, [editor, resolvedHtml]);

  useEffect(() => {
    if (!linkOpen || !editor) {
      return;
    }

    setLinkValue(editor.getAttributes('link').href ?? '');
  }, [editor, linkOpen]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[1.35rem] border border-border/60 bg-background/70 shadow-sm',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-1 border-border/60 border-b bg-background/80 px-3 py-2">
        <ToolbarButton
          active={editor?.isActive('bold')}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={!editor}
          toneClasses={toneClasses}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('italic')}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={!editor}
          toneClasses={toneClasses}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('underline')}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          disabled={!editor}
          toneClasses={toneClasses}
          title="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('strike')}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          disabled={!editor}
          toneClasses={toneClasses}
          title="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <div className="mx-1 h-6 w-px bg-border/60" />
        <ToolbarButton
          active={editor?.isActive('heading', { level: 1 })}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 1 }).run()
          }
          disabled={!editor}
          toneClasses={toneClasses}
          title="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('heading', { level: 2 })}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
          disabled={!editor}
          toneClasses={toneClasses}
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('bulletList')}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={!editor}
          toneClasses={toneClasses}
          title="Bullet list"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('orderedList')}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          disabled={!editor}
          toneClasses={toneClasses}
          title="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('blockquote')}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          disabled={!editor}
          toneClasses={toneClasses}
          title="Quote"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('code')}
          onClick={() => editor?.chain().focus().toggleCode().run()}
          disabled={!editor}
          toneClasses={toneClasses}
          title="Inline code"
        >
          <Code2 className="h-4 w-4" />
        </ToolbarButton>
        <div className="mx-1 h-6 w-px bg-border/60" />
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn(
                'h-8 w-8 rounded-xl border border-transparent',
                editor?.isActive('link')
                  ? toneClasses.selectedOptionClassName
                  : 'text-muted-foreground hover:border-border/60 hover:bg-background/70 hover:text-foreground'
              )}
            >
              <Link2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-3">
            <Input
              value={linkValue}
              onChange={(event) => setLinkValue(event.target.value)}
              placeholder="https://example.com"
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!editor) {
                    return;
                  }

                  editor
                    .chain()
                    .focus()
                    .extendMarkRange('link')
                    .unsetLink()
                    .run();
                  setLinkValue('');
                  setLinkOpen(false);
                }}
              >
                <Unlink className="mr-2 h-4 w-4" />
                Remove
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!editor) {
                    return;
                  }

                  setEditorLink(editor, linkValue);
                  setLinkOpen(false);
                }}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="relative">
        {placeholder && isEmpty ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 px-4 py-3 text-muted-foreground text-sm">
            {placeholder}
          </div>
        ) : null}
        <EditorContent
          editor={editor}
          className={cn(
            '[&_.ProseMirror]:px-4 [&_.ProseMirror]:py-3 [&_.ProseMirror]:text-sm [&_.ProseMirror]:outline-none [&_.ProseMirror_a]:text-dynamic-cyan [&_.ProseMirror_a]:underline [&_.ProseMirror_blockquote]:border-border/60 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-muted/60 [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_li_p]:my-0 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_p]:min-h-5 [&_.ProseMirror_p]:leading-6 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5',
            compact ? '[&_.ProseMirror]:min-h-24' : '[&_.ProseMirror]:min-h-36',
            toneClasses.fieldClassName
          )}
        />
      </div>
    </div>
  );
}
