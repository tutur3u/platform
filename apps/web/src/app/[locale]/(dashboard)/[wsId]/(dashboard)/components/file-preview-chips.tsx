'use client';

import {
  AlertCircle,
  AudioLines,
  AudioWaveform,
  Download,
  ExternalLink,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  X,
  ZoomIn,
} from '@tuturuuu/icons';
import { Dialog, DialogContent, DialogTitle } from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useRef, useState } from 'react';

export interface ChatFile {
  id: string;
  file: File;
  /** Blob-URL preview for images/videos (available during the upload session). */
  previewUrl: string | null;
  /** Storage path returned by the upload endpoint. */
  storagePath: string | null;
  /** Signed read URL fetched after upload — survives blob URL revocation. */
  signedUrl: string | null;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
}

/** Serializable file metadata stored alongside a sent message for display in
 *  the chat history. Unlike `ChatFile` this does not hold a `File` handle —
 *  only the information needed to render a preview chip inside a message bubble. */
export interface MessageFileAttachment {
  alias?: string | null;
  id: string;
  name: string;
  size: number;
  type: string;
  /** Blob-URL preview for images/videos (only available during the current session). */
  previewUrl: string | null;
  /** Supabase Storage path (e.g. `{wsId}/chats/ai/resources/{chatId}/…`). */
  storagePath: string | null;
  /** Signed read URL from storage — survives page refresh (time-limited). */
  signedUrl: string | null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getAttachmentDisplayName(
  attachment: Pick<MessageFileAttachment, 'alias' | 'name'>
): string {
  return attachment.alias?.trim() || attachment.name;
}

/** Return the best available media source URL for an attachment.
 *  Prefers signed URL (persists across refreshes / blob URL revocation),
 *  falls back to blob URL (immediate, works during current session). */
function getMediaSrc(
  attachment: Pick<MessageFileAttachment, 'previewUrl' | 'signedUrl'>
): string | null {
  return attachment.signedUrl || attachment.previewUrl || null;
}

function isImageType(type: string): boolean {
  return type.startsWith('image/');
}

function isVideoType(type: string): boolean {
  return type.startsWith('video/');
}

function isAudioType(type: string): boolean {
  return type.startsWith('audio/');
}

function isPdfType(type: string): boolean {
  return type === 'application/pdf';
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (isAudioType(mimeType)) {
    return <AudioLines className="h-4 w-4 text-dynamic-cyan" />;
  }
  if (isImageType(mimeType)) {
    return <ImageIcon className="h-4 w-4 text-dynamic-blue" />;
  }
  if (isVideoType(mimeType)) {
    return <FileVideo className="h-4 w-4 text-dynamic-purple" />;
  }
  if (isPdfType(mimeType)) {
    return <FileText className="h-4 w-4 text-dynamic-red" />;
  }
  if (
    mimeType === 'text/csv' ||
    mimeType === 'application/json' ||
    mimeType === 'text/markdown'
  ) {
    return <FileText className="h-4 w-4 text-dynamic-green" />;
  }
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

// ---------------------------------------------------------------------------
// Input-side file chip (with remove button)
// ---------------------------------------------------------------------------

function FileChip({
  chatFile,
  onRemove,
  disabled,
}: {
  chatFile: ChatFile;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { file, previewUrl, signedUrl, status } = chatFile;
  const isAudio = isAudioType(file.type);
  const isImage = isImageType(file.type);
  const isVideo = isVideoType(file.type);
  const audioSrc = signedUrl || previewUrl;

  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-background/80 shadow-sm backdrop-blur-sm transition-all',
        isAudio && audioSrc
          ? 'flex w-full min-w-[17rem] max-w-sm flex-col gap-2 p-2.5 pr-10'
          : 'flex items-center gap-2 p-1.5 pr-2',
        status === 'error'
          ? 'border-destructive/40 bg-destructive/5'
          : status === 'uploading'
            ? 'animate-pulse border-dynamic-purple/30'
            : 'border-border/60 hover:border-border'
      )}
    >
      <div className={cn('flex gap-2', isAudio && audioSrc && 'items-start')}>
        {/* Thumbnail / Icon */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/60">
          {isImage && previewUrl ? (
            // biome-ignore lint/performance/noImgElement: blob URL not compatible with Next.js Image
            <img
              src={previewUrl}
              alt={file.name}
              className="h-full w-full object-cover"
            />
          ) : isVideo && previewUrl ? (
            <div className="relative flex h-full w-full items-center justify-center">
              <video
                src={previewUrl}
                className="h-full w-full object-cover"
                muted
                preload="metadata"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Play className="h-3.5 w-3.5 fill-white text-white" />
              </div>
            </div>
          ) : isAudio ? (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <AudioWaveform className="h-4 w-4 text-foreground/70" />
            </div>
          ) : (
            <FileIcon mimeType={file.type} />
          )}
        </div>

        {/* Name + size */}
        <div className="flex min-w-0 flex-col">
          <span className="max-w-48 truncate font-medium text-xs leading-tight">
            {file.name}
          </span>
          <span className="text-[10px] text-muted-foreground leading-tight">
            {status === 'uploading'
              ? 'Uploading…'
              : status === 'error'
                ? 'Failed'
                : formatFileSize(file.size)}
          </span>
        </div>
      </div>

      {isAudio && audioSrc && (
        <audio
          controls
          preload="metadata"
          src={audioSrc}
          className="h-10 w-full"
        />
      )}

      {/* Remove button */}
      {!disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            'absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full',
            'bg-foreground/80 text-background opacity-0 shadow-sm transition-opacity',
            'hover:bg-foreground group-hover:opacity-100',
            'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          aria-label={`Remove ${file.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Upload progress overlay */}
      {status === 'uploading' && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/40 backdrop-blur-[1px]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-dynamic-purple border-t-transparent" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Input-side preview strip (used in ChatInputBar)
// ---------------------------------------------------------------------------

interface FilePreviewChipsProps {
  files: ChatFile[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export default function FilePreviewChips({
  files,
  onRemove,
  disabled,
}: FilePreviewChipsProps) {
  const handleRemove = useCallback(
    (id: string) => {
      onRemove(id);
    },
    [onRemove]
  );

  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      {files.map((chatFile) => (
        <FileChip
          key={chatFile.id}
          chatFile={chatFile}
          onRemove={() => handleRemove(chatFile.id)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fullscreen media lightbox (images + videos)
// ---------------------------------------------------------------------------

/** Lightbox content type — determines which element to render. */
type LightboxMedia =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'video'; src: string; alt: string; type: string };

function MediaLightbox({
  media,
  open,
  onOpenChange,
}: {
  media: LightboxMedia;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-[90vw] items-center justify-center border-none bg-transparent p-0 shadow-none sm:max-w-[90vw]">
        <DialogTitle className="sr-only">{media.alt}</DialogTitle>
        <div className="relative flex items-center justify-center">
          {media.kind === 'image' ? (
            // biome-ignore lint/performance/noImgElement: signed/blob URL not compatible with Next.js Image
            <img
              src={media.src}
              alt={media.alt}
              className="max-h-[85vh] max-w-[88vw] rounded-lg object-contain shadow-2xl"
            />
          ) : (
            <video
              src={media.src}
              controls
              autoPlay
              className="max-h-[85vh] max-w-[88vw] rounded-lg shadow-2xl"
            />
          )}
          {/* Download link */}
          <a
            href={media.src}
            target="_blank"
            rel="noopener noreferrer"
            download={media.alt}
            className={cn(
              'absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-full',
              'bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80'
            )}
            aria-label="Download"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Read-only attachment display for inside chat message bubbles
// ---------------------------------------------------------------------------

/** Generic non-media file chip (text, CSV, JSON, etc.) */
function MessageAttachmentChip({
  attachment,
  invertColors,
}: {
  attachment: MessageFileAttachment;
  invertColors?: boolean;
}) {
  const src = getMediaSrc(attachment);
  const isImage = isImageType(attachment.type);

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg p-1.5 pr-2.5 transition-colors',
        invertColors
          ? 'bg-background/10 hover:bg-background/15'
          : 'border border-border/40 bg-muted/30 hover:bg-muted/50'
      )}
    >
      {/* Thumbnail / Icon */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md',
          invertColors ? 'bg-background/15' : 'bg-muted/60'
        )}
      >
        {isImage && src ? (
          // biome-ignore lint/performance/noImgElement: signed/blob URL not compatible with Next.js Image
          <img
            src={src}
            alt={getAttachmentDisplayName(attachment)}
            className="h-full w-full object-cover"
          />
        ) : (
          <FileIcon mimeType={attachment.type} />
        )}
      </div>

      {/* Name + size */}
      <div className="flex min-w-0 flex-col">
        <span
          className={cn(
            'max-w-28 truncate font-medium text-[11px] leading-tight',
            invertColors ? 'text-background' : 'text-foreground'
          )}
        >
          {getAttachmentDisplayName(attachment)}
        </span>
        <span
          className={cn(
            'text-[10px] leading-tight',
            invertColors ? 'text-background/50' : 'text-muted-foreground'
          )}
        >
          {formatFileSize(attachment.size)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image thumbnails
// ---------------------------------------------------------------------------

/** A single image thumbnail in the message gallery with click-to-expand. */
function MessageImageThumbnail({
  attachment,
  invertColors,
  isSingle,
  onExpand,
}: {
  attachment: MessageFileAttachment;
  invertColors?: boolean;
  isSingle: boolean;
  onExpand: (media: LightboxMedia) => void;
}) {
  const src = getMediaSrc(attachment);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const sizeClasses = isSingle
    ? 'h-52 w-full max-w-72'
    : 'h-24 w-24 sm:h-28 sm:w-28';

  // No source available at all
  if (!src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center overflow-hidden rounded-xl',
          invertColors ? 'bg-background/10' : 'bg-muted/40',
          sizeClasses
        )}
      >
        <ImageIcon
          className={cn(
            'h-6 w-6',
            invertColors ? 'text-background/30' : 'text-muted-foreground/30'
          )}
        />
      </div>
    );
  }

  // Image failed to load — show error with retry
  if (errored) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl',
          invertColors ? 'bg-background/10' : 'bg-muted/40',
          sizeClasses
        )}
      >
        <AlertCircle
          className={cn(
            'h-5 w-5',
            invertColors ? 'text-background/40' : 'text-muted-foreground/40'
          )}
        />
        <button
          type="button"
          onClick={() => {
            setErrored(false);
            setLoaded(false);
            setRetryCount((c) => c + 1);
          }}
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] transition-colors',
            invertColors
              ? 'bg-background/15 text-background/60 hover:bg-background/25'
              : 'bg-muted/60 text-muted-foreground hover:bg-muted'
          )}
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() =>
        onExpand({
          kind: 'image',
          src,
          alt: getAttachmentDisplayName(attachment),
        })
      }
      className={cn(
        'group/img relative overflow-hidden rounded-xl transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        invertColors
          ? 'ring-1 ring-background/20 hover:ring-background/40'
          : 'ring-1 ring-border/40 hover:ring-border/60',
        isSingle ? 'max-h-56 w-full max-w-72' : 'h-24 w-24 sm:h-28 sm:w-28'
      )}
    >
      {/* Loading skeleton — visible until the image fires onLoad */}
      {!loaded && (
        <div
          className={cn(
            'absolute inset-0 z-10 flex items-center justify-center',
            invertColors ? 'bg-background/10' : 'bg-muted/40'
          )}
        >
          <Loader2
            className={cn(
              'h-5 w-5 animate-spin',
              invertColors ? 'text-background/40' : 'text-muted-foreground/40'
            )}
          />
        </div>
      )}
      {/* biome-ignore lint/performance/noImgElement: signed/blob URL not compatible with Next.js Image */}
      <img
        key={retryCount}
        src={src}
        alt={getAttachmentDisplayName(attachment)}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={cn(
          'h-full w-full object-cover transition-transform duration-200 group-hover/img:scale-105',
          isSingle && 'max-h-56',
          !loaded && 'invisible'
        )}
      />
      {/* Hover overlay with zoom icon */}
      {loaded && (
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-opacity duration-150',
            'bg-black/0 opacity-0 group-hover/img:bg-black/20 group-hover/img:opacity-100'
          )}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
            <ZoomIn className="h-4 w-4" />
          </div>
        </div>
      )}
    </button>
  );
}

/** Renders a compact image gallery for image attachments inside a message bubble. */
function MessageImageGallery({
  images,
  invertColors,
  onMediaExpand,
}: {
  images: MessageFileAttachment[];
  invertColors?: boolean;
  onMediaExpand: (media: LightboxMedia) => void;
}) {
  if (images.length === 0) return null;

  const isSingle = images.length === 1;

  return (
    <div
      className={cn(
        'flex flex-wrap gap-1.5',
        isSingle ? 'max-w-72' : 'max-w-[18rem]'
      )}
    >
      {images.map((img) => (
        <MessageImageThumbnail
          key={img.id}
          attachment={img}
          invertColors={invertColors}
          isSingle={isSingle}
          onExpand={onMediaExpand}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Video player (inline in message bubble)
// ---------------------------------------------------------------------------

function MessageVideoPlayer({
  attachment,
  invertColors,
  onExpand,
}: {
  attachment: MessageFileAttachment;
  invertColors?: boolean;
  onExpand: (media: LightboxMedia) => void;
}) {
  const src = getMediaSrc(attachment);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  if (!src) {
    return (
      <div
        className={cn(
          'flex h-40 w-full max-w-72 items-center justify-center overflow-hidden rounded-xl',
          invertColors ? 'bg-background/10' : 'bg-muted/40'
        )}
      >
        <FileVideo
          className={cn(
            'h-8 w-8',
            invertColors ? 'text-background/30' : 'text-muted-foreground/30'
          )}
        />
      </div>
    );
  }

  if (errored) {
    return (
      <div
        className={cn(
          'flex h-40 w-full max-w-72 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl',
          invertColors ? 'bg-background/10' : 'bg-muted/40'
        )}
      >
        <AlertCircle
          className={cn(
            'h-6 w-6',
            invertColors ? 'text-background/40' : 'text-muted-foreground/40'
          )}
        />
        <span
          className={cn(
            'text-[11px]',
            invertColors ? 'text-background/50' : 'text-muted-foreground/50'
          )}
        >
          Failed to load video
        </span>
        <button
          type="button"
          onClick={() => {
            setErrored(false);
            setLoaded(false);
            setRetryCount((c) => c + 1);
          }}
          className={cn(
            'flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] transition-colors',
            invertColors
              ? 'bg-background/15 text-background/60 hover:bg-background/25'
              : 'bg-muted/60 text-muted-foreground hover:bg-muted'
          )}
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  const togglePlayback = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div
      className={cn(
        'group/vid relative max-w-72 overflow-hidden rounded-xl',
        invertColors ? 'ring-1 ring-background/20' : 'ring-1 ring-border/40'
      )}
    >
      {/* Loading skeleton */}
      {!loaded && (
        <div
          className={cn(
            'flex h-40 w-full items-center justify-center',
            invertColors ? 'bg-background/10' : 'bg-muted/40'
          )}
        >
          <Loader2
            className={cn(
              'h-6 w-6 animate-spin',
              invertColors ? 'text-background/40' : 'text-muted-foreground/40'
            )}
          />
        </div>
      )}
      <video
        key={retryCount}
        ref={videoRef}
        src={src}
        className={cn(
          'max-h-56 w-full rounded-xl bg-black object-contain',
          !loaded && 'h-0 overflow-hidden'
        )}
        preload="metadata"
        playsInline
        onLoadedMetadata={() => setLoaded(true)}
        onError={() => setErrored(true)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Play/pause overlay — always visible when paused, fades on hover when playing */}
      {loaded && (
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-opacity duration-150',
            isPlaying
              ? 'opacity-0 hover:opacity-100'
              : 'bg-black/30 opacity-100'
          )}
        >
          <button
            type="button"
            onClick={togglePlayback}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            aria-label={isPlaying ? 'Pause video' : 'Play video'}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-white" />
            ) : (
              <Play className="h-5 w-5 fill-white" />
            )}
          </button>
        </div>
      )}

      {/* Expand to fullscreen button */}
      {loaded && (
        <button
          type="button"
          onClick={() =>
            onExpand({
              kind: 'video',
              src,
              alt: getAttachmentDisplayName(attachment),
              type: attachment.type,
            })
          }
          className={cn(
            'absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full',
            'bg-black/50 text-white backdrop-blur-sm transition-all',
            'opacity-0 hover:bg-black/70 group-hover/vid:opacity-100'
          )}
          aria-label="Expand video"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
      )}

      {/* File name badge */}
      {loaded && (
        <div
          className={cn(
            'absolute bottom-2 left-2 flex max-w-[60%] items-center gap-1 rounded-md px-1.5 py-0.5',
            'bg-black/50 backdrop-blur-sm transition-opacity',
            'opacity-0 group-hover/vid:opacity-100'
          )}
        >
          <FileVideo className="h-3 w-3 shrink-0 text-white/70" />
          <span className="truncate text-[10px] text-white/90">
            {getAttachmentDisplayName(attachment)}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio player (inline in message bubble)
// ---------------------------------------------------------------------------

function MessageAudioPlayer({
  attachment,
  invertColors,
}: {
  attachment: MessageFileAttachment;
  invertColors?: boolean;
}) {
  const src = getMediaSrc(attachment);

  return (
    <div
      className={cn(
        'flex max-w-72 flex-col gap-3 overflow-hidden rounded-xl p-3',
        invertColors
          ? 'bg-background/10'
          : 'border border-border/40 bg-muted/30'
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            invertColors ? 'bg-background/15' : 'bg-dynamic-cyan/10'
          )}
        >
          <AudioWaveform
            className={cn(
              'h-5 w-5',
              invertColors ? 'text-background/80' : 'text-dynamic-cyan'
            )}
          />
        </div>
        <div className="min-w-0">
          <p
            className={cn(
              'truncate font-medium text-xs',
              invertColors ? 'text-background' : 'text-foreground'
            )}
          >
            {getAttachmentDisplayName(attachment)}
          </p>
          <p
            className={cn(
              'text-[10px]',
              invertColors ? 'text-background/50' : 'text-muted-foreground'
            )}
          >
            {formatFileSize(attachment.size)}
          </p>
        </div>
      </div>

      {src ? (
        <audio src={src} controls preload="metadata" className="h-10 w-full" />
      ) : (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]',
            invertColors
              ? 'bg-background/10 text-background/60'
              : 'bg-muted/60 text-muted-foreground'
          )}
        >
          <AudioLines className="h-3.5 w-3.5" />
          {getAttachmentDisplayName(attachment)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PDF preview (clickable card with open-in-new-tab)
// ---------------------------------------------------------------------------

function MessagePdfPreview({
  attachment,
  invertColors,
}: {
  attachment: MessageFileAttachment;
  invertColors?: boolean;
}) {
  const src = getMediaSrc(attachment);

  return (
    <div
      className={cn(
        'flex max-w-72 items-center gap-3 overflow-hidden rounded-xl p-2.5 transition-colors',
        invertColors
          ? 'bg-background/10 hover:bg-background/15'
          : 'border border-border/40 bg-muted/30 hover:bg-muted/50'
      )}
    >
      {/* PDF icon */}
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          invertColors ? 'bg-background/15' : 'bg-dynamic-red/10'
        )}
      >
        <FileText
          className={cn(
            'h-5 w-5',
            invertColors ? 'text-background/80' : 'text-dynamic-red'
          )}
        />
      </div>

      {/* Name + size */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'truncate font-medium text-xs leading-tight',
            invertColors ? 'text-background' : 'text-foreground'
          )}
        >
          {getAttachmentDisplayName(attachment)}
        </span>
        <span
          className={cn(
            'text-[10px] leading-tight',
            invertColors ? 'text-background/50' : 'text-muted-foreground'
          )}
        >
          PDF · {formatFileSize(attachment.size)}
        </span>
      </div>

      {/* Open in new tab */}
      {src && (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
            invertColors
              ? 'bg-background/15 text-background/70 hover:bg-background/25 hover:text-background'
              : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          aria-label={`Open ${getAttachmentDisplayName(attachment)}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component: renders file attachments inside a chat message bubble
// ---------------------------------------------------------------------------

interface MessageFileAttachmentsProps {
  attachments: MessageFileAttachment[];
  /** When true, uses inverted colour scheme (for user bubbles with dark bg). */
  invertColors?: boolean;
}

/** Read-only component that renders file attachments inside a chat message bubble.
 *  Images are shown as a thumbnail gallery with click-to-expand lightbox;
 *  videos get an inline player with expand-to-fullscreen;
 *  PDFs show a styled card with open-in-new-tab;
 *  other files are rendered as compact chips. */
export function MessageFileAttachments({
  attachments,
  invertColors,
}: MessageFileAttachmentsProps) {
  const [lightboxMedia, setLightboxMedia] = useState<LightboxMedia | null>(
    null
  );

  const handleMediaExpand = useCallback((media: LightboxMedia) => {
    setLightboxMedia(media);
  }, []);

  if (attachments.length === 0) return null;

  // Categorise attachments by type
  const audios = attachments.filter((a) => isAudioType(a.type));
  const images = attachments.filter((a) => isImageType(a.type));
  const videos = attachments.filter((a) => isVideoType(a.type));
  const pdfs = attachments.filter((a) => isPdfType(a.type));
  const others = attachments.filter(
    (a) =>
      !isAudioType(a.type) &&
      !isImageType(a.type) &&
      !isVideoType(a.type) &&
      !isPdfType(a.type)
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        {/* Image gallery */}
        {images.length > 0 && (
          <MessageImageGallery
            images={images}
            invertColors={invertColors}
            onMediaExpand={handleMediaExpand}
          />
        )}

        {/* Video players */}
        {videos.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {videos.map((video) => (
              <MessageVideoPlayer
                key={video.id}
                attachment={video}
                invertColors={invertColors}
                onExpand={handleMediaExpand}
              />
            ))}
          </div>
        )}

        {/* Audio players */}
        {audios.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {audios.map((audio) => (
              <MessageAudioPlayer
                key={audio.id}
                attachment={audio}
                invertColors={invertColors}
              />
            ))}
          </div>
        )}

        {/* PDF previews */}
        {pdfs.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {pdfs.map((pdf) => (
              <MessagePdfPreview
                key={pdf.id}
                attachment={pdf}
                invertColors={invertColors}
              />
            ))}
          </div>
        )}

        {/* Other file chips */}
        {others.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {others.map((attachment) => (
              <MessageAttachmentChip
                key={attachment.id}
                attachment={attachment}
                invertColors={invertColors}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen media lightbox (images + videos) */}
      {lightboxMedia && (
        <MediaLightbox
          media={lightboxMedia}
          open={!!lightboxMedia}
          onOpenChange={(open) => {
            if (!open) setLightboxMedia(null);
          }}
        />
      )}
    </>
  );
}
