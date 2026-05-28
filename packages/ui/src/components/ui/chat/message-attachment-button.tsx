'use client';

import { Download, FileText, LoaderCircle } from '@tuturuuu/icons';
import type { ChatAttachment } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useChatAttachmentSignedUrl } from './hooks-attachments';
import {
  type AttachmentPreviewType,
  MessageAttachmentPreviewDialog,
} from './message-attachment-preview-dialog';
import { formatFileSize } from './utils';

export function MessageAttachmentButton({
  attachment,
  onOpenAttachment,
  wsId,
}: {
  attachment: ChatAttachment;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  wsId: string;
}) {
  const t = useTranslations('chat');
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewType = getAttachmentPreviewType(attachment);
  const signedUrlQuery = useChatAttachmentSignedUrl({
    attachmentId: attachment.id,
    conversationId: attachment.conversationId,
    enabled: previewType !== 'file',
    wsId,
  });
  const signedUrl = signedUrlQuery.data;

  return (
    <div className="overflow-hidden rounded-md border bg-background/70">
      {previewType !== 'file' ? (
        <AttachmentPreview
          attachment={attachment}
          isLoading={signedUrlQuery.isLoading}
          onOpenPreview={() => setPreviewOpen(true)}
          previewType={previewType}
          signedUrl={signedUrl}
        />
      ) : null}
      <MessageAttachmentPreviewDialog
        attachment={attachment}
        onOpenChange={setPreviewOpen}
        open={previewOpen}
        previewType={previewType}
        signedUrl={signedUrl}
      />
      <button
        className={cn(
          'flex w-full min-w-0 items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-accent',
          previewType !== 'file' && 'border-t bg-muted/20'
        )}
        onClick={() => onOpenAttachment?.(attachment)}
        type="button"
      >
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {attachment.filename}
          </span>
          <span className="block text-muted-foreground text-xs">
            {attachment.sizeBytes
              ? formatFileSize(attachment.sizeBytes)
              : t('attachment')}
          </span>
        </span>
        <Download className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}

function AttachmentPreview({
  attachment,
  isLoading,
  onOpenPreview,
  previewType,
  signedUrl,
}: {
  attachment: ChatAttachment;
  isLoading: boolean;
  onOpenPreview: () => void;
  previewType: AttachmentPreviewType;
  signedUrl?: string;
}) {
  if (isLoading) {
    return (
      <div className="flex h-36 items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
      </div>
    );
  }

  if (!signedUrl) return null;

  if (previewType === 'image') {
    return (
      <button
        aria-label={attachment.filename}
        className="block aspect-video w-full bg-center bg-contain bg-muted bg-no-repeat"
        onClick={onOpenPreview}
        style={{ backgroundImage: `url("${signedUrl}")` }}
        type="button"
      />
    );
  }

  if (previewType === 'audio') {
    return (
      <audio
        aria-label={attachment.filename}
        className="w-full px-2 py-3"
        controls
        preload="metadata"
        src={signedUrl}
      />
    );
  }

  return (
    <button
      aria-label={attachment.filename}
      className={cn(
        'block w-full overflow-hidden border-0 bg-muted',
        previewType === 'pdf' ? 'h-80' : 'aspect-video'
      )}
      onClick={onOpenPreview}
      type="button"
    >
      {previewType === 'video' ? (
        <video
          className="h-full w-full object-contain"
          muted
          preload="metadata"
          src={signedUrl}
        />
      ) : (
        <iframe
          className="h-full w-full border-0 bg-white"
          src={signedUrl}
          title={attachment.filename}
        />
      )}
    </button>
  );
}

function getAttachmentPreviewType(
  attachment: ChatAttachment
): AttachmentPreviewType {
  const contentType = attachment.contentType?.toLowerCase() ?? '';
  const extension = attachment.filename.split('.').pop()?.toLowerCase() ?? '';

  if (
    contentType.startsWith('image/') ||
    ['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp'].includes(extension)
  ) {
    return 'image';
  }

  if (
    contentType.startsWith('video/') ||
    ['m4v', 'mov', 'mp4', 'webm'].includes(extension)
  ) {
    return 'video';
  }

  if (
    contentType.startsWith('audio/') ||
    ['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav'].includes(extension)
  ) {
    return 'audio';
  }

  if (contentType === 'application/pdf' || extension === 'pdf') {
    return 'pdf';
  }

  return 'file';
}
