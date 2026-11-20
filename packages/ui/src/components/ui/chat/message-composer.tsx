'use client';

import { LoaderCircle, Paperclip, Send, X } from '@tuturuuu/icons';
import type { ChatAttachmentDraft, ChatMessage } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '../button';
import { toast } from '../sonner';
import { Textarea } from '../textarea';
import { ComposerAttachmentChip } from './composer-attachment-chip';
import { MessageReplyPreview } from './message-reply-quote';
import { formatFileSize } from './utils';

const MAX_COMPOSER_ATTACHMENTS = 20;
// Mirrors MAX_AI_ATTACHMENT_BYTES on the server. Rejecting here means the user
// finds out before the upload instead of after it.
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export interface ChatMessageDraft {
  attachments: ChatAttachmentDraft[];
  content: string;
  replyToMessageId?: string;
}

interface MessageComposerProps {
  allowAttachments?: boolean;
  disabled?: boolean;
  isSending?: boolean;
  isUploading?: boolean;
  onCancelReply: () => void;
  onSend: (payload: ChatMessageDraft) => Promise<void> | void;
  onUploadFile: (file: File) => Promise<ChatAttachmentDraft>;
  replyTo?: { id: string; message?: ChatMessage };
}

export function MessageComposer({
  allowAttachments = true,
  disabled,
  isSending,
  isUploading,
  onCancelReply,
  onSend,
  onUploadFile,
  replyTo,
}: MessageComposerProps) {
  const t = useTranslations('chat');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const replyToMessageId = replyTo?.id;

  useLayoutEffect(() => {
    if (replyToMessageId) textareaRef.current?.focus();
  }, [replyToMessageId]);
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachmentDraft[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // Thumbnails come from the local File, so they render immediately and cost
  // no round trip. Object URLs leak unless revoked, hence the cleanup below.
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const previewUrlsRef = useRef(previewUrls);
  previewUrlsRef.current = previewUrls;

  useEffect(
    () => () => {
      for (const url of Object.values(previewUrlsRef.current)) {
        URL.revokeObjectURL(url);
      }
    },
    []
  );

  function releasePreview(path: string) {
    setPreviewUrls((current) => {
      const url = current[path];
      if (!url) return current;
      URL.revokeObjectURL(url);
      const next = { ...current };
      delete next[path];
      return next;
    });
  }

  const busy = disabled || isSending || isUploading || uploadingCount > 0;
  const replyUnavailable =
    replyTo && (!replyTo.message || replyTo.message.deletedAt);
  const canSend =
    !replyUnavailable && (content.trim().length > 0 || attachments.length > 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || busy) return;

    const draftContent = content.trim();
    const draftAttachments = attachments;

    setContent('');
    setAttachments([]);
    for (const draft of draftAttachments) releasePreview(draft.path);

    try {
      await onSend({
        attachments: draftAttachments,
        content: draftContent,
        ...(replyToMessageId ? { replyToMessageId } : {}),
      });
    } catch {
      setContent(draftContent);
      setAttachments(draftAttachments);
    }
  }

  async function handleFileCandidates(files: File[]) {
    if (!allowAttachments || disabled || files.length === 0) return;

    const withinSizeLimit = files.filter(
      (file) => file.size <= MAX_ATTACHMENT_BYTES
    );
    if (withinSizeLimit.length < files.length) {
      toast.error(
        t('attachment_too_large', {
          size: formatFileSize(MAX_ATTACHMENT_BYTES),
        })
      );
    }
    if (withinSizeLimit.length === 0) return;

    const remainingSlots = Math.max(
      MAX_COMPOSER_ATTACHMENTS - attachments.length,
      0
    );
    if (remainingSlots === 0) {
      toast.error(
        t('attachment_limit_reached', { count: MAX_COMPOSER_ATTACHMENTS })
      );
      return;
    }

    const nextFiles = withinSizeLimit.slice(0, remainingSlots);
    if (nextFiles.length < withinSizeLimit.length) {
      toast.error(
        t('attachment_limit_reached', { count: MAX_COMPOSER_ATTACHMENTS })
      );
    }

    setUploadingCount((count) => count + nextFiles.length);
    const uploaded: ChatAttachmentDraft[] = [];

    for (const file of nextFiles) {
      try {
        const draft = await onUploadFile(file);
        uploaded.push(draft);
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
          const url = URL.createObjectURL(file);
          setPreviewUrls((current) => ({ ...current, [draft.path]: url }));
        }
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

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    setIsDraggingOver(false);
    if (!allowAttachments || disabled) return;

    const dropped = Array.from(event.dataTransfer?.files ?? []);
    if (dropped.length === 0) return;

    event.preventDefault();
    void handleFileCandidates(dropped);
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    await handleFileCandidates(Array.from(files));
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!allowAttachments || disabled) return;

    const clipboardData = event.clipboardData;
    const candidates: File[] = [];

    for (const item of Array.from(clipboardData.items)) {
      if (item.kind !== 'file') continue;

      const file = item.getAsFile();
      if (file) candidates.push(file);
    }

    if (candidates.length === 0) return;

    void handleFileCandidates(candidates);

    if (!clipboardData.getData('text/plain')) {
      event.preventDefault();
    }
  }

  return (
    <form
      className={cn(
        'relative border-t bg-background/95 p-3 transition-colors',
        isDraggingOver && 'bg-primary/5 ring-2 ring-primary ring-inset'
      )}
      onDragLeave={(event) => {
        // Only clear when the pointer actually leaves the composer, not when it
        // crosses into a child element.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDraggingOver(false);
        }
      }}
      onDragOver={(event) => {
        if (!allowAttachments || disabled) return;
        if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) {
          return;
        }
        event.preventDefault();
        setIsDraggingOver(true);
      }}
      onDrop={handleDrop}
      onSubmit={handleSubmit}
    >
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-sm bg-background/80 font-medium text-primary text-sm">
          {t('drop_files_here')}
        </div>
      )}
      {replyTo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-sm border-s-2 bg-muted/40 px-2 py-1 text-xs">
          <div aria-live="polite" className="min-w-0">
            <MessageReplyPreview draft message={replyTo.message} />
          </div>
          <Button
            aria-label={t('cancel_reply')}
            className="size-7 shrink-0"
            onClick={() => {
              onCancelReply();
              textareaRef.current?.focus();
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <ComposerAttachmentChip
              attachment={attachment}
              key={attachment.path}
              onRemove={() => {
                releasePreview(attachment.path);
                setAttachments((current) =>
                  current.filter((item) => item.path !== attachment.path)
                );
              }}
              previewUrl={previewUrls[attachment.path]}
              removeLabel={t('remove_attachment')}
            />
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {allowAttachments ? (
          <>
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
          </>
        ) : null}
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
          onPaste={handlePaste}
          placeholder={t('message_placeholder')}
          ref={textareaRef}
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
