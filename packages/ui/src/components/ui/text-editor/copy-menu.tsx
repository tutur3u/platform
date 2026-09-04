'use client';

import type { Editor } from '@tiptap/react';
import { Code2, Copy, FileText } from '@tuturuuu/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { Toggle } from '@tuturuuu/ui/toggle';
import { useCallback, useState } from 'react';
import {
  serializeClipboardPlainText,
  serializeClipboardText,
} from './clipboard-serialization';
import { TOOLBAR_BUTTON_CLASS_NAME } from './toolbar-controls';

export interface EditorCopyLabels {
  copy?: string;
  copyAsMarkdown?: string;
  copyAsPlainText?: string;
  markdownDescription?: string;
  plainTextDescription?: string;
  markdownCopied?: string;
  plainTextCopied?: string;
  copyFailed?: string;
}

interface EditorCopyMenuProps {
  editor: Editor;
  labels?: EditorCopyLabels;
}

const DEFAULT_LABELS = {
  copy: 'Copy content',
  copyAsMarkdown: 'Copy as Markdown',
  copyAsPlainText: 'Copy as plain text',
  markdownDescription: 'Keep headings, lists, links, and formatting syntax',
  plainTextDescription: 'Clean text for chat, email, or documents',
  markdownCopied: 'Copied as Markdown',
  plainTextCopied: 'Copied as plain text',
  copyFailed: 'Could not copy content',
} satisfies Required<EditorCopyLabels>;

export function EditorCopyMenu({ editor, labels }: EditorCopyMenuProps) {
  const [open, setOpen] = useState(false);
  const copy = useCallback(
    async (format: 'markdown' | 'text') => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Unavailable');
        const slice = editor.state.doc.slice(0, editor.state.doc.content.size);
        const content =
          format === 'markdown'
            ? serializeClipboardText(slice)
            : serializeClipboardPlainText(slice);
        await navigator.clipboard.writeText(content);
        toast.success(
          format === 'markdown'
            ? (labels?.markdownCopied ?? DEFAULT_LABELS.markdownCopied)
            : (labels?.plainTextCopied ?? DEFAULT_LABELS.plainTextCopied)
        );
      } catch {
        toast.error(labels?.copyFailed ?? DEFAULT_LABELS.copyFailed);
      }
    },
    [editor, labels]
  );

  const copyLabel = labels?.copy ?? DEFAULT_LABELS.copy;
  const copyAndClose = (format: 'markdown' | 'text') => {
    setOpen(false);
    void copy(format);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Toggle
          pressed={open}
          disabled={editor.isEmpty}
          aria-label={copyLabel}
          className={`${TOOLBAR_BUTTON_CLASS_NAME} data-[state=open]:border-foreground/10 data-[state=open]:bg-dynamic-surface/80 data-[state=open]:text-foreground`}
        >
          <Copy className="size-4" />
        </Toggle>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          {copyLabel}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="items-start gap-3 py-2.5"
          onSelect={() => copyAndClose('markdown')}
        >
          <Code2 className="mt-0.5 size-4 shrink-0 text-dynamic-blue" />
          <span className="min-w-0">
            <span className="block font-medium">
              {labels?.copyAsMarkdown ?? DEFAULT_LABELS.copyAsMarkdown}
            </span>
            <span className="block whitespace-normal text-muted-foreground text-xs leading-relaxed">
              {labels?.markdownDescription ??
                DEFAULT_LABELS.markdownDescription}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="items-start gap-3 py-2.5"
          onSelect={() => copyAndClose('text')}
        >
          <FileText className="mt-0.5 size-4 shrink-0 text-dynamic-green" />
          <span className="min-w-0">
            <span className="block font-medium">
              {labels?.copyAsPlainText ?? DEFAULT_LABELS.copyAsPlainText}
            </span>
            <span className="block whitespace-normal text-muted-foreground text-xs leading-relaxed">
              {labels?.plainTextDescription ??
                DEFAULT_LABELS.plainTextDescription}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
