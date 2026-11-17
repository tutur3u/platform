'use client';

import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, type Editor, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import { toast } from '@tuturuuu/ui/sonner';
import { embeddedMailImages } from './mail-composer-paste';
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
} from '@tuturuuu/icons';
import type { MailAttachment } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAIL_IMAGE_WIDTH_PRESETS,
  MailComposerImage,
} from './mail-composer-image';
import {
  createMailImageNodes,
  ensureUniqueMailImageIds,
  type MailImageNodes,
  mailImageNodeId,
  stripPendingMailImages,
} from './mail-composer-image-nodes';
import { splitComposerQuote } from './mail-composer-quote';
import {
  type ComposerSelection,
  captureComposerSelection,
} from './mail-composer-selection';
import { mailHtmlToText } from './mail-composer-utils';
import { MailMessagePreview } from './mail-message-preview';

export interface MailComposerEditorProps {
  attachments?: MailAttachment[];
  initialHtml: string;
  onChange: (value: { html: string; text: string }) => void;
  onEnhance: () => void;
  /** Fires on every document change, including placeholder-only ones. */
  onImageNodesChange?: () => void;
  /** Hands the composer the node operations for this editor, or null on unmount. */
  onImageNodes?: (nodes: MailImageNodes | null) => void;
  onPasteImages?: (files: File[], inline: boolean) => void;
  onRemoveImage?: (id: string) => void;
  onRetryImage?: (id: string) => void;
  onSelectionChange: (selection: ComposerSelection | null) => void;
}

/**
 * Memoized: upload progress changes the composer's media state many times,
 * and none of it may re-render the editor. Image placeholders are driven
 * through `onImageNodes`, never through props.
 */
export const MailComposerEditor = memo(function MailComposerEditor({
  attachments = [],
  initialHtml,
  onChange,
  onEnhance,
  onImageNodes,
  onImageNodesChange,
  onRemoveImage,
  onPasteImages,
  onRetryImage,
  onSelectionChange,
}: MailComposerEditorProps) {
  const t = useTranslations('mail');
  const actions = useRef({ onImageNodesChange, onRemoveImage, onRetryImage, onPasteImages });
  actions.current = { onImageNodesChange, onRemoveImage, onRetryImage, onPasteImages };
  const lastEmitted = useRef<string | null>(null);
  const parts = useMemo(() => splitComposerQuote(initialHtml), [initialHtml]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  // null: no settled image selected; '': selected image keeps its natural size.
  const [imageWidth, setImageWidth] = useState<string | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);
  const [href, setHref] = useState('https://');
  const editor = useEditor({
    content: parts.authored,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      MailComposerImage.configure({
        allowBase64: false,
        resizeLabels: () => ({
          label: t('image_resize'),
          value: (width) => t('image_resize_value', { width }),
        }),
        uploadActions: () => ({
          remove: (id) => actions.current.onRemoveImage?.(id),
          retry: (id) => actions.current.onRetryImage?.(id),
        }),
        uploadLabels: () => ({
          describe: (name, state) =>
            t('media_item_state', { name, state: t(`media_state_${state}`) }),
          failed: t('upload_failed'),
          named: (action, name) => t('media_action_named', { action, name }),
          queued: t('upload_waiting'),
          remove: t('media_remove'),
          retry: t('retry'),
          uploading: t('uploading'),
        }),
      }),
      Placeholder.configure({ placeholder: t('write_message') }),
    ],
    editorProps: {
      handleDOMEvents: {
        paste: (view, event) => {
          const html = event.clipboardData?.getData('text/html');
          if (!html || !actions.current.onPasteImages) return false;
          try {
            const media = embeddedMailImages(html);
            if (!media.files.length) return false;
            event.preventDefault();
            const container = document.createElement('div');
            container.innerHTML = media.html;
            const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(container);
            view.dispatch(view.state.tr.replaceSelection(slice));
            actions.current.onPasteImages(media.files, true);
            return true;
          } catch {
            event.preventDefault();
            toast.error(t('upload_failed'), {
              description: t('clipboard_image_invalid'),
            });
            return true;
          }
        },
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor: nextEditor }) => {
      // Repairing identities dispatches again, and that update does the rest.
      if (ensureUniqueMailImageIds(nextEditor)) return;
      actions.current.onImageNodesChange?.();
      // Placeholders are stripped: a draft never carries a preview or blob.
      const authored = stripPendingMailImages(nextEditor.getHTML());
      // Status-only changes to a placeholder leave the body untouched, so they
      // must not mark the draft dirty or clear the user's selection.
      if (authored === lastEmitted.current) return;
      lastEmitted.current = authored;
      const html = authored + parts.quoted;
      onChange({
        html,
        text: [nextEditor.getText(), mailHtmlToText(parts.quoted)]
          .filter(Boolean)
          .join('\n\n'),
      });
      onSelectionChange(null);
      setImageWidth(selectedImageWidth(nextEditor));
      setImageId(selectedImageId(nextEditor));
    },
    onSelectionUpdate: ({ editor: current }) => {
      const selection = captureComposerSelection(current);
      setHasSelection(Boolean(selection));
      setImageWidth(selectedImageWidth(current));
      setImageId(selectedImageId(current));
      onSelectionChange(selection);
    },
  });

  useEffect(() => {
    if (!editor || stripPendingMailImages(editor.getHTML()) === parts.authored)
      return;
    lastEmitted.current = parts.authored;
    editor.commands.setContent(parts.authored, { emitUpdate: false });
  }, [editor, parts.authored]);

  useEffect(() => {
    if (!editor || !onImageNodes) return;
    onImageNodes(createMailImageNodes(editor));
    return () => onImageNodes(null);
  }, [editor, onImageNodes]);

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
        {imageWidth !== null && (
          <>
            <div className="mx-1 h-5 w-px bg-border" />
            <div
              aria-label={t('image_size')}
              className="flex items-center gap-0.5"
              role="group"
            >
              {MAIL_IMAGE_WIDTH_PRESETS.map((percent) => (
                <Button
                  aria-label={t('image_size_percent', { percent })}
                  aria-pressed={imageWidth === `${percent}%`}
                  className={cn(
                    'px-2 text-xs',
                    imageWidth === `${percent}%` && 'bg-accent'
                  )}
                  key={percent}
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .updateAttributes('image', {
                        width: `${percent}%`,
                        height: null,
                      })
                      .run()
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {percent}%
                </Button>
              ))}
              {imageId !== null && onRemoveImage && (
                <Button
                  aria-label={t('media_remove_image')}
                  onClick={() => onRemoveImage(imageId)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </>
        )}
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
          className="[&_.ProseMirror]:min-h-56 [&_.ProseMirror]:px-5 [&_.ProseMirror]:py-5 [&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-6 [&_.ProseMirror]:outline-none [&_.ProseMirror_a]:underline [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_.ProseMirror-selectednode_img]:outline [&_.ProseMirror_.ProseMirror-selectednode_img]:outline-2 [&_.ProseMirror_.ProseMirror-selectednode_img]:outline-ring [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_p]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.is-editor-empty:first-child:before]:pointer-events-none [&_.is-editor-empty:first-child:before]:float-left [&_.is-editor-empty:first-child:before]:h-0 [&_.is-editor-empty:first-child:before]:text-muted-foreground [&_.is-editor-empty:first-child:before]:content-[attr(data-placeholder)]"
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
                attachments={attachments}
                title={t('quoted_text')}
              />
            )}
          </details>
        )}
      </div>
    </div>
  );
});

function selectedImageWidth(editor: Editor) {
  if (!editor.isActive('image')) return null;
  const attrs = editor.getAttributes('image');
  if (attrs.uploadState) return null;
  return String(attrs.width ?? '');
}

function selectedImageId(editor: Editor) {
  if (!editor.isActive('image')) return null;
  const attrs = editor.getAttributes('image');
  return attrs.uploadState ? null : mailImageNodeId(attrs);
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
