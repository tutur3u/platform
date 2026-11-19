'use client';

import { X, ZoomIn, ZoomOut } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { Button } from '../button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../dialog';
import { MediaPreviewStage } from './media-preview-stage';

export type MediaPreviewItem = {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Caption heading, for example what the screenshot shows. */
  title: string;
  /** Facts about the image, for example store, device and language. */
  details?: readonly string[];
};

export type MediaPreviewLabels = {
  close: string;
  previous: string;
  next: string;
  zoomIn: string;
  zoomOut: string;
  /** Names the thumbnail list. */
  thumbnails: string;
  counter: (index: number, total: number) => string;
};

const MAX_ZOOM = 4;

/**
 * A full-bleed preview for a set of images: focus is trapped and Escape
 * closes (Dialog); Left and Right, swipes and edge buttons move between
 * items; + and - (or the buttons, or a double click) zoom, 0 resets; the
 * caption, counter and a thumbnail strip stay in view.
 */
export function MediaPreviewDialog({
  items,
  index,
  open,
  onOpenChange,
  onIndexChange,
  onCloseAutoFocus,
  labels,
}: {
  items: readonly MediaPreviewItem[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
  /** Where focus goes on close; the opener, since there is no Dialog trigger. */
  onCloseAutoFocus?: (event: Event) => void;
  labels: MediaPreviewLabels;
}) {
  const [zoom, setZoom] = useState(1);
  const item = items[index];
  const last = items.length - 1;

  const go = (next: number) => {
    if (next < 0 || next > last) return;
    setZoom(1);
    onIndexChange(next);
  };
  const zoomBy = (step: number) =>
    setZoom((value) => Math.min(MAX_ZOOM, Math.max(1, value + step)));

  // Warm the neighbours so stepping never waits on the network.
  useEffect(() => {
    if (!open) return;
    for (const next of [items[index - 1], items[index + 1]])
      if (next) new Image().src = next.src;
  }, [open, items, index]);

  const onKeyDown = (event: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => go(index - 1),
      ArrowRight: () => go(index + 1),
      '+': () => zoomBy(1),
      '=': () => zoomBy(1),
      '-': () => zoomBy(-1),
      '0': () => setZoom(1),
    };
    const run = keys[event.key];
    if (!run || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    run();
  };

  if (!item) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setZoom(1);
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        onKeyDown={onKeyDown}
        onCloseAutoFocus={onCloseAutoFocus}
        className="h-[min(60rem,calc(100dvh-1rem))] max-w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <header className="flex items-start gap-3 border-b p-3 sm:p-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate leading-tight">
              {item.title}
            </DialogTitle>
            <DialogDescription className="mt-1 truncate">
              {item.details?.join(' · ')}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-11"
              aria-label={labels.close}
            >
              <X aria-hidden />
            </Button>
          </DialogClose>
        </header>
        <MediaPreviewStage
          key={item.src}
          item={item}
          zoom={zoom}
          onZoomChange={setZoom}
          canPrevious={index > 0}
          canNext={index < last}
          onPrevious={() => go(index - 1)}
          onNext={() => go(index + 1)}
          previousLabel={labels.previous}
          nextLabel={labels.next}
        >
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background/90 p-1 shadow-sm backdrop-blur">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-11 rounded-full"
              aria-label={labels.zoomOut}
              disabled={zoom <= 1}
              onClick={() => zoomBy(-1)}
            >
              <ZoomOut aria-hidden />
            </Button>
            <span
              aria-live="polite"
              className="min-w-16 text-center text-sm tabular-nums"
            >
              {labels.counter(index + 1, items.length)}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-11 rounded-full"
              aria-label={labels.zoomIn}
              disabled={zoom >= MAX_ZOOM}
              onClick={() => zoomBy(1)}
            >
              <ZoomIn aria-hidden />
            </Button>
          </div>
        </MediaPreviewStage>
        {items.length > 1 && (
          <ul
            aria-label={labels.thumbnails}
            className="flex gap-2 overflow-x-auto border-t p-2 sm:p-3"
          >
            {items.map((entry, position) => (
              <li key={entry.src} className="shrink-0">
                <button
                  type="button"
                  aria-label={entry.title}
                  aria-current={position === index || undefined}
                  onClick={() => go(position)}
                  className={cn(
                    'block h-14 overflow-hidden rounded-md border opacity-70 outline-ring/50 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2',
                    position === index &&
                      'border-primary opacity-100 ring-2 ring-primary/30'
                  )}
                  style={{ aspectRatio: entry.width / entry.height }}
                >
                  <img
                    src={entry.src}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
