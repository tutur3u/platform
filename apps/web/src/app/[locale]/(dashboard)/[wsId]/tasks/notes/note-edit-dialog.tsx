'use client';

import type { JSONContent } from '@tiptap/react';
import { NotebookPen, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';

interface NoteEditDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onTitleChange: (title: string) => void;
  content: JSONContent | null;
  onContentChange: (content: JSONContent | null) => void;
}

export function NoteEditDialog({
  isOpen,
  onOpenChange,
  title,
  onTitleChange,
  content,
  onContentChange,
}: NoteEditDialogProps) {
  const t = useTranslations('dashboard.bucket_dump');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange} modal={true}>
      <DialogContent
        showCloseButton={false}
        className="inset-0! top-0! left-0! flex h-screen max-h-screen w-screen max-w-none! translate-x-0! translate-y-0! gap-0 rounded-none! border-0 p-0"
      >
        {/* Main content area - Note title and description */}
        <div className="flex min-w-0 flex-1 flex-col bg-background transition-all duration-300">
          {/* Enhanced Header with gradient */}
          <div className="flex items-center justify-between border-b px-4 py-2 md:px-8">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
                <NotebookPen className="h-4 w-4 text-dynamic-orange" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <DialogTitle className="truncate font-semibold text-base text-foreground md:text-lg">
                  {t('edit_dialog.title')}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {t('edit_dialog.description')}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-1 md:gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleClose}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Main editing area with improved spacing */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex flex-col">
              {/* Note Title - Large and prominent with underline effect */}
              <div className="group">
                <Input
                  ref={titleInputRef}
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter key moves to description
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const editorElement = editorRef.current?.querySelector(
                        '.ProseMirror'
                      ) as HTMLElement;
                      if (editorElement) {
                        editorElement.focus();
                      }
                    }
                  }}
                  placeholder="Note title..."
                  className="h-auto border-0 bg-transparent p-4 pb-0 font-bold text-2xl text-foreground leading-tight tracking-tight shadow-none transition-colors placeholder:text-muted-foreground/30 focus-visible:outline-0 focus-visible:ring-0 md:px-8 md:pt-4 md:pb-2 md:text-2xl"
                  autoFocus
                />
              </div>

              {/* Note Description - Full editor experience with subtle border */}
              <div ref={editorRef} className="relative">
                <RichTextEditor
                  content={content}
                  onChange={onContentChange}
                  writePlaceholder={t('edit_dialog.content_placeholder')}
                  titlePlaceholder=""
                  className="min-h-[calc(100vh-16rem)] border-0 bg-transparent px-4 focus-visible:outline-0 focus-visible:ring-0 md:px-8"
                />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
