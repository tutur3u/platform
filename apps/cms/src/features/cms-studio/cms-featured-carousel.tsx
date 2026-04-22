'use client';

import type {
  ExternalProjectDeliveryCollection,
  ExternalProjectEntry,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CmsStrings } from './cms-strings';
import {
  extractMarkdown,
  formatStatus,
  getDeliveryEntryVisual,
  statusTone,
} from './cms-studio-utils';
import { ResilientMediaImage } from './resilient-media-image';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type FeaturedPreviewItem = {
  description: string;
  entry: ExternalProjectDeliveryCollection['entries'][number];
  managedEntry: ExternalProjectEntry | null;
  visualAlt: string;
  visualUrl: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildFeaturedItems(
  entries: ExternalProjectDeliveryCollection['entries'],
  managedEntries: ExternalProjectEntry[],
  emptyDescription: string
) {
  return [...entries]
    .sort((left, right) => {
      const leftHasVisual = Boolean(getDeliveryEntryVisual(left)?.assetUrl);
      const rightHasVisual = Boolean(getDeliveryEntryVisual(right)?.assetUrl);

      return Number(rightHasVisual) - Number(leftHasVisual);
    })
    .slice(0, 8)
    .map((entry) => {
      const visual = getDeliveryEntryVisual(entry);
      const managedEntry =
        managedEntries.find((managed) => managed.id === entry.id) ?? null;
      const description =
        entry.summary?.trim() ||
        extractMarkdown(entry)[0]?.markdown ||
        emptyDescription;

      return {
        description,
        entry,
        managedEntry,
        visualAlt: visual?.alt_text ?? entry.title,
        visualUrl: visual?.assetUrl ?? null,
      } satisfies FeaturedPreviewItem;
    });
}

function FeaturedPreviewViewer({
  activeIndex,
  items,
  onClose,
  onOpenEntry,
  onSelect,
  strings,
}: {
  activeIndex: number | null;
  items: FeaturedPreviewItem[];
  onClose: () => void;
  onOpenEntry: (entryId: string) => void;
  onSelect: (index: number) => void;
  strings: CmsStrings;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef({
    pointerX: 0,
    pointerY: 0,
    translateX: 0,
    translateY: 0,
  });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeItem = activeIndex === null ? null : (items[activeIndex] ?? null);
  const activeEntryId = activeItem?.entry.id ?? null;
  const currentIndex = activeIndex ?? 0;

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!activeEntryId) {
      return;
    }

    resetView();
  }, [activeEntryId, resetView]);

  useEffect(() => {
    if (!activeItem) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'ArrowRight') {
        onSelect((currentIndex + 1) % items.length);
        return;
      }

      if (event.key === 'ArrowLeft') {
        onSelect((currentIndex - 1 + items.length) % items.length);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeItem, currentIndex, items.length, onClose, onSelect]);

  if (!activeItem || activeIndex === null) {
    return null;
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nextScale = clamp(
      scale * 1.1 ** (-event.deltaY / 100),
      MIN_ZOOM,
      MAX_ZOOM
    );

    if (nextScale === scale) {
      return;
    }

    if (!viewportRef.current) {
      setScale(nextScale);
      return;
    }

    const bounds = viewportRef.current.getBoundingClientRect();
    const cursorX = event.clientX - (bounds.left + bounds.width / 2);
    const cursorY = event.clientY - (bounds.top + bounds.height / 2);

    if (nextScale <= 1) {
      setScale(nextScale);
      setTranslate({ x: 0, y: 0 });
      return;
    }

    const relativeX = (cursorX - translate.x) / scale;
    const relativeY = (cursorY - translate.y) / scale;

    setScale(nextScale);
    setTranslate({
      x: cursorX - relativeX * nextScale,
      y: cursorY - relativeY * nextScale,
    });
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (scale <= 1) {
      return;
    }

    setIsDragging(true);
    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      translateX: translate.x,
      translateY: translate.y,
    };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) {
      return;
    }

    setTranslate({
      x:
        dragStartRef.current.translateX +
        (event.clientX - dragStartRef.current.pointerX),
      y:
        dragStartRef.current.translateY +
        (event.clientY - dragStartRef.current.pointerY),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);

    if (scale <= 1) {
      setTranslate({ x: 0, y: 0 });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-background/88 p-3 backdrop-blur-xl md:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex h-full flex-col overflow-hidden rounded-[1.6rem] border border-border/70 bg-card/95 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-border/60 border-b px-4 py-4 md:px-6">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn(
                  'border-0 px-2 py-0.5 text-[11px] shadow-none',
                  statusTone(activeItem.managedEntry?.status ?? 'draft')
                )}
              >
                {formatStatus(
                  activeItem.managedEntry?.status ?? 'draft',
                  strings
                )}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {activeIndex + 1} / {items.length}
              </span>
            </div>
            <div className="font-semibold text-lg">
              {activeItem.entry.title}
            </div>
            <p className="max-w-2xl text-muted-foreground text-sm leading-6">
              {activeItem.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() =>
                setScale((current) => clamp(current - 0.3, MIN_ZOOM, MAX_ZOOM))
              }
              size="sm"
              variant="secondary"
            >
              {strings.zoomOutAction}
            </Button>
            <Button onClick={resetView} size="sm" variant="secondary">
              {strings.resetZoomAction}
            </Button>
            <Button
              onClick={() =>
                setScale((current) => clamp(current + 0.3, MIN_ZOOM, MAX_ZOOM))
              }
              size="sm"
              variant="secondary"
            >
              {strings.zoomInAction}
            </Button>
            <Button
              onClick={() => onOpenEntry(activeItem.entry.id)}
              size="sm"
              variant="secondary"
            >
              {strings.openDetailsAction}
            </Button>
            <Button onClick={onClose} size="sm" variant="default">
              {strings.closeFullscreenAction}
            </Button>
          </div>
        </div>

        <div
          ref={viewportRef}
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.14),transparent_30%),linear-gradient(160deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]"
          onDoubleClick={resetView}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseUp}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        >
          <Button
            className="absolute top-1/2 left-3 z-20 -translate-y-1/2"
            onClick={() =>
              onSelect((activeIndex - 1 + items.length) % items.length)
            }
            size="sm"
            type="button"
            variant="secondary"
          >
            {strings.previousAction}
          </Button>

          <div
            className="relative h-full w-full transition-transform duration-150 ease-out"
            style={{
              cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in',
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          >
            {activeItem.visualUrl ? (
              <div className="relative h-full w-full">
                <ResilientMediaImage
                  alt={activeItem.visualAlt}
                  assetUrl={activeItem.visualUrl}
                  className="object-contain"
                  fill
                  previewUrl={activeItem.visualUrl}
                  sizes="100vw"
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                {strings.missingLeadImageLabel}
              </div>
            )}
          </div>

          <Button
            className="absolute top-1/2 right-3 z-20 -translate-y-1/2"
            onClick={() => onSelect((activeIndex + 1) % items.length)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {strings.nextAction}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-border/60 border-t px-4 py-3 md:px-6">
          <p className="text-muted-foreground text-xs">
            {strings.carouselInteractionHint}
          </p>
          <div className="flex max-w-full gap-2 overflow-x-auto">
            {items.map((item, index) => (
              <button
                key={item.entry.id}
                className={cn(
                  'relative h-18 w-18 shrink-0 overflow-hidden rounded-xl border transition-colors',
                  index === activeIndex
                    ? 'border-foreground/20'
                    : 'border-border/70 hover:border-foreground/15'
                )}
                onClick={() => onSelect(index)}
                type="button"
              >
                {item.visualUrl ? (
                  <div className="relative h-full w-full">
                    <ResilientMediaImage
                      alt=""
                      assetUrl={item.visualUrl}
                      className="object-cover"
                      fill
                      previewUrl={item.visualUrl}
                      sizes="72px"
                    />
                  </div>
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CmsFeaturedCarousel({
  entries,
  managedEntries,
  onOpenEntry,
  strings,
}: {
  entries: ExternalProjectDeliveryCollection['entries'];
  managedEntries: ExternalProjectEntry[];
  onOpenEntry: (entryId: string) => void;
  strings: CmsStrings;
}) {
  const items = useMemo(
    () =>
      buildFeaturedItems(
        entries,
        managedEntries,
        strings.previewEmptyDescription
      ),
    [entries, managedEntries, strings.previewEmptyDescription]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (items.length === 0) {
    return null;
  }

  const activeItem = items[activeIndex] ?? items[0]!;
  const safeViewerIndex =
    viewerIndex !== null && viewerIndex < items.length ? viewerIndex : null;

  return (
    <>
      <section className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-card/95">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:p-5">
          <button
            type="button"
            className="group relative overflow-hidden rounded-[1.15rem] border border-border/70 bg-background/80 text-left"
            onClick={() => setViewerIndex(activeIndex)}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.14),transparent_30%),linear-gradient(160deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]" />
            <div className="relative aspect-[16/10]">
              {activeItem.visualUrl ? (
                <ResilientMediaImage
                  alt={activeItem.visualAlt}
                  assetUrl={activeItem.visualUrl}
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  fill
                  previewUrl={activeItem.visualUrl}
                  sizes="(max-width: 1024px) 100vw, 55vw"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  {strings.missingLeadImageLabel}
                </div>
              )}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/70 to-transparent px-4 py-4">
              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    'border-0 px-2 py-0.5 text-[11px] shadow-none',
                    statusTone(activeItem.managedEntry?.status ?? 'draft')
                  )}
                >
                  {formatStatus(
                    activeItem.managedEntry?.status ?? 'draft',
                    strings
                  )}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {strings.featuredEntryTitle}
                </span>
              </div>
            </div>
          </button>

          <div className="flex flex-col justify-between gap-4 rounded-[1.15rem] border border-border/70 bg-background/70 p-4">
            <div className="space-y-3">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.24em]">
                {strings.featuredEntryTitle}
              </div>
              <div className="font-semibold text-2xl tracking-tight">
                {activeItem.entry.title}
              </div>
              <p className="text-muted-foreground text-sm leading-6">
                {activeItem.description}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    setActiveIndex(
                      (current) => (current - 1 + items.length) % items.length
                    )
                  }
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {strings.previousAction}
                </Button>
                <Button
                  onClick={() =>
                    setActiveIndex((current) => (current + 1) % items.length)
                  }
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {strings.nextAction}
                </Button>
                <Button
                  onClick={() => setViewerIndex(activeIndex)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {strings.fullscreenAction}
                </Button>
                <Button
                  onClick={() => onOpenEntry(activeItem.entry.id)}
                  size="sm"
                  type="button"
                >
                  {strings.openDetailsAction}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                {strings.carouselInteractionHint}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 overflow-x-auto border-border/60 border-t px-4 py-4">
          {items.map((item, index) => (
            <button
              key={item.entry.id}
              className={cn(
                'group flex min-w-[12rem] max-w-[12rem] items-center gap-3 rounded-[1rem] border p-2 text-left transition-colors',
                index === activeIndex
                  ? 'border-foreground/20 bg-background'
                  : 'border-border/70 bg-background/40 hover:border-foreground/15'
              )}
              onClick={() => setActiveIndex(index)}
              type="button"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[0.8rem] bg-muted">
                {item.visualUrl ? (
                  <div className="relative h-full w-full">
                    <ResilientMediaImage
                      alt=""
                      assetUrl={item.visualUrl}
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      fill
                      previewUrl={item.visualUrl}
                      sizes="64px"
                    />
                  </div>
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
              </div>
              <div className="min-w-0">
                <div className="line-clamp-2 font-medium text-sm">
                  {item.entry.title}
                </div>
                <div className="line-clamp-1 text-muted-foreground text-xs">
                  {item.entry.slug}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <FeaturedPreviewViewer
        activeIndex={safeViewerIndex}
        items={items}
        onClose={() => setViewerIndex(null)}
        onOpenEntry={onOpenEntry}
        onSelect={setViewerIndex}
        strings={strings}
      />
    </>
  );
}
