'use client';

import { FileText, Film, Music, X } from '@tuturuuu/icons';
import type { ChatAttachmentDraft } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { Button } from '../button';
import { formatFileSize } from './utils';

export type ComposerAttachmentKind = 'audio' | 'file' | 'image' | 'video';

export function getComposerAttachmentKind(
  filename: string,
  contentType?: string | null
): ComposerAttachmentKind {
  const type = contentType?.toLowerCase() ?? '';
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';

  if (
    type.startsWith('image/') ||
    ['avif', 'gif', 'heic', 'jpeg', 'jpg', 'png', 'webp'].includes(extension)
  ) {
    return 'image';
  }
  if (
    type.startsWith('video/') ||
    ['m4v', 'mov', 'mp4', 'webm'].includes(extension)
  ) {
    return 'video';
  }
  if (
    type.startsWith('audio/') ||
    ['aac', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav'].includes(extension)
  ) {
    return 'audio';
  }
  return 'file';
}

const kindIcon = {
  audio: Music,
  file: FileText,
  image: FileText,
  video: Film,
} as const;

/**
 * A queued attachment, shown before the message is sent. Media gets a real
 * thumbnail from the local file rather than a filename chip — a picture is the
 * only reliable way to confirm you attached the right screenshot.
 */
export function ComposerAttachmentChip({
  attachment,
  onRemove,
  previewUrl,
  removeLabel,
}: {
  attachment: ChatAttachmentDraft;
  onRemove: () => void;
  previewUrl?: string;
  removeLabel: string;
}) {
  const kind = getComposerAttachmentKind(
    attachment.filename,
    attachment.contentType
  );
  const showsThumbnail = Boolean(previewUrl) && kind !== 'file';
  const Icon = kindIcon[kind];

  return (
    <div
      className={cn(
        'group relative flex min-w-0 items-center gap-2 overflow-hidden rounded-md border bg-muted/40 text-sm',
        showsThumbnail ? 'p-1 pr-1' : 'px-2 py-1'
      )}
    >
      {showsThumbnail ? (
        <span className="size-10 shrink-0 overflow-hidden rounded bg-background">
          {kind === 'video' ? (
            <video
              className="size-full object-cover"
              muted
              preload="metadata"
              src={previewUrl}
            />
          ) : kind === 'audio' ? (
            <span className="flex size-full items-center justify-center">
              <Music className="size-4 text-muted-foreground" />
            </span>
          ) : (
            /* biome-ignore lint/performance/noImgElement: local blob: URL for a not-yet-sent file; next/image cannot optimize object URLs */
            <img
              alt={attachment.filename}
              className="size-full object-cover"
              src={previewUrl}
            />
          )}
        </span>
      ) : (
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      )}

      <span className="min-w-0 flex-1">
        <span
          className="block max-w-40 truncate font-medium"
          title={attachment.filename}
        >
          {attachment.filename}
        </span>
        {attachment.sizeBytes ? (
          <span className="block text-muted-foreground text-xs">
            {formatFileSize(attachment.sizeBytes)}
          </span>
        ) : null}
      </span>

      <Button
        aria-label={removeLabel}
        className="size-6 shrink-0"
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
