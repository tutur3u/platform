'use client';

import type { ChatAttachment } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useState, type WheelEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../dialog';
import { formatFileSize } from './utils';

export type AttachmentPreviewType =
  | 'audio'
  | 'file'
  | 'image'
  | 'pdf'
  | 'video';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.12;

export function MessageAttachmentPreviewDialog({
  attachment,
  onOpenChange,
  open,
  previewType,
  signedUrl,
}: {
  attachment: ChatAttachment;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  previewType: AttachmentPreviewType;
  signedUrl?: string;
}) {
  const [zoom, setZoom] = useState(1);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) setZoom(1);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!signedUrl || previewType === 'audio') return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoom((current) =>
      Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Number((current + direction * ZOOM_STEP).toFixed(2)))
      )
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="grid h-[92dvh] max-h-[92dvh] max-w-[96vw] grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
        <div className="min-w-0 pr-10">
          <DialogTitle className="truncate text-base">
            {attachment.filename}
          </DialogTitle>
          <DialogDescription>
            {attachment.sizeBytes ? formatFileSize(attachment.sizeBytes) : ''}
          </DialogDescription>
        </div>
        <div
          className="min-h-0 overflow-auto rounded-md bg-black/90"
          onWheel={handleWheel}
        >
          <AttachmentDialogContent
            previewType={previewType}
            signedUrl={signedUrl}
            title={attachment.filename}
            zoom={zoom}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AttachmentDialogContent({
  previewType,
  signedUrl,
  title,
  zoom,
}: {
  previewType: AttachmentPreviewType;
  signedUrl?: string;
  title: string;
  zoom: number;
}) {
  if (!signedUrl) return null;

  if (previewType === 'image') {
    return (
      <div
        className="grid min-h-full min-w-full place-items-center p-4"
        style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
      >
        <span
          aria-label={title}
          className="block h-full min-h-[70dvh] w-full bg-center bg-contain bg-no-repeat"
          role="img"
          style={{ backgroundImage: `url("${signedUrl}")` }}
        />
      </div>
    );
  }

  if (previewType === 'video') {
    return (
      <video
        className="mx-auto block max-h-full max-w-full"
        controls
        preload="metadata"
        src={signedUrl}
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
      />
    );
  }

  if (previewType === 'audio') {
    return (
      <div className="flex h-full min-h-[60dvh] items-center justify-center p-6">
        <audio className="w-full max-w-2xl" controls src={signedUrl} />
      </div>
    );
  }

  return (
    <iframe
      className={cn('block h-full min-h-[78dvh] w-full border-0 bg-white')}
      src={signedUrl}
      style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
      title={title}
    />
  );
}
