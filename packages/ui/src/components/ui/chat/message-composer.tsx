'use client';

import { LoaderCircle, Paperclip, Send, Upload, X } from '@tuturuuu/icons';
import type { ChatAttachmentDraft } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { Button } from '../button';
import { toast } from '../sonner';
import { Textarea } from '../textarea';
import { formatFileSize } from './utils';

interface MessageComposerProps {
  disabled?: boolean;
  isSending?: boolean;
  isUploading?: boolean;
  onSend: (payload: {
    attachments: ChatAttachmentDraft[];
    content: string;
  }) => Promise<void> | void;
  onUploadFile: (file: File) => Promise<ChatAttachmentDraft>;
}

export function MessageComposer({
  disabled,
  isSending,
  isUploading,
  onSend,
  onUploadFile,
}: MessageComposerProps) {
  const t = useTranslations('chat');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachmentDraft[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);

  const busy = disabled || isSending || isUploading || uploadingCount > 0;
  const canSend = content.trim().length > 0 || attachments.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || busy) return;

    await onSend({
      attachments,
      content: content.trim(),
    });
    setContent('');
    setAttachments([]);
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;

    setUploadingCount((count) => count + files.length);
    const uploaded: ChatAttachmentDraft[] = [];

    for (const file of Array.from(files)) {
      try {
        uploaded.push(await onUploadFile(file));
      } catch {
        toast.error(t('upload_failed'));
      } finally {
        setUploadingCount((count) => Math.max(0, count - 1));
      }
    }

    if (uploaded.length > 0) {
      setAttachments((current) => [...current, ...uploaded]);
    }

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  return (
    <form className="border-t bg-background/95 p-3" onSubmit={handleSubmit}>
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div
              className="flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-sm"
              key={attachment.path}
            >
              <Upload className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{attachment.filename}</span>
              {attachment.sizeBytes ? (
                <span className="shrink-0 text-muted-foreground text-xs">
                  {formatFileSize(attachment.sizeBytes)}
                </span>
              ) : null}
              <Button
                aria-label={t('remove_attachment')}
                className="size-6"
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((item) => item.path !== attachment.path)
                  )
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          className="hidden"
          multiple
          onChange={(event) => handleFiles(event.target.files)}
          ref={inputRef}
          type="file"
        />
        <Button
          aria-label={t('attach_files')}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          size="icon"
          type="button"
          variant="outline"
        >
          {uploadingCount > 0 ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Paperclip className="size-4" />
          )}
        </Button>
        <Textarea
          className={cn(
            'max-h-40 min-h-10 resize-none text-sm',
            disabled && 'opacity-60'
          )}
          disabled={disabled}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={t('message_placeholder')}
          value={content}
        />
        <Button
          aria-label={t('send_message')}
          disabled={!canSend || busy}
          size="icon"
          type="submit"
        >
          {isSending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </form>
  );
}
