'use client';

import { Maximize2 } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  type PreviewLabels,
  type PreviewMode,
  previewModes,
} from './brand-data';

/** Light/dark asset preview with an expandable dialog. */

export function BrandPreview({
  imageClassName,
  locked = false,
  labels,
  mode,
  monoClassName,
  name,
  onModeChange,
  previewClassName,
  src,
  wide = false,
}: {
  imageClassName: string;
  locked?: boolean;
  labels: PreviewLabels;
  mode: PreviewMode;
  monoClassName: string;
  name: string;
  onModeChange: (mode: PreviewMode) => void;
  previewClassName: string;
  src: string;
  wide?: boolean;
}) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const activeMode =
    previewModes.find((previewMode) => previewMode.key === mode) ??
    previewModes[0];

  return (
    <>
      <div
        className={cn(
          'group/brand-preview relative grid place-items-center overflow-hidden rounded-md border border-border p-7',
          previewClassName
        )}
        style={{ backgroundColor: activeMode.background }}
      >
        {!locked && (
          <PreviewModeControls
            activeMode={mode}
            floating
            labels={labels}
            onModeChange={onModeChange}
          />
        )}
        <Button
          aria-label={labels.fullscreen}
          className="absolute top-3 right-3 z-30 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100 group-focus-within/brand-preview:opacity-100 group-hover/brand-preview:opacity-100"
          onClick={() => setFullscreenOpen(true)}
          size="icon"
          type="button"
          variant="outline"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <button
          aria-label={labels.fullscreen}
          className="grid place-items-center focus-visible:outline-none"
          onClick={() => setFullscreenOpen(true)}
          type="button"
        >
          <motion.span
            animate={{ scale: [1, 1.025, 1] }}
            className="pointer-events-none grid place-items-center"
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <PreviewAssetVisual
              imageClassName={imageClassName}
              mode={activeMode}
              monoClassName={monoClassName}
              name={name}
              src={src}
            />
          </motion.span>
        </button>
      </div>

      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_1fr] overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]">
          <div className="flex flex-col gap-4 border-border border-b p-4 pr-14 sm:flex-row sm:items-center sm:justify-between">
            <DialogTitle>
              {name} {labels.title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {labels.description}
            </DialogDescription>
            {!locked && (
              <PreviewModeControls
                activeMode={mode}
                alwaysVisible
                labels={labels}
                onModeChange={onModeChange}
              />
            )}
          </div>
          <div
            className="grid min-h-0 place-items-center overflow-hidden p-6"
            style={{ backgroundColor: activeMode.background }}
          >
            <PreviewAssetVisual
              fullscreen
              imageClassName={
                wide
                  ? 'h-auto w-[min(82vw,72rem)]'
                  : 'h-[min(54vh,28rem)] w-[min(54vh,28rem)]'
              }
              mode={activeMode}
              monoClassName={
                wide
                  ? 'aspect-[2369/512] w-[min(82vw,72rem)]'
                  : 'h-[min(54vh,28rem)] w-[min(54vh,28rem)]'
              }
              name={name}
              src={src}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PreviewModeControls({
  activeMode,
  alwaysVisible = false,
  floating = false,
  labels,
  onModeChange,
}: {
  activeMode: PreviewMode;
  alwaysVisible?: boolean;
  floating?: boolean;
  labels: PreviewLabels;
  onModeChange: (mode: PreviewMode) => void;
}) {
  return (
    <div
      className={cn(
        'group/theme-picker z-30 flex overflow-hidden rounded-md border border-border bg-background/80 p-1 backdrop-blur-sm transition-all duration-200',
        alwaysVisible
          ? 'opacity-100'
          : 'opacity-0 focus-within:opacity-100 hover:opacity-100 group-focus-within/brand-preview:opacity-100 group-hover/brand-preview:opacity-100',
        floating && 'absolute top-3 left-3'
      )}
    >
      {previewModes.map((mode) => {
        const Icon = mode.icon;
        const active = activeMode === mode.key;

        return (
          <button
            aria-label={labels[mode.key]}
            className={cn(
              'inline-flex h-8 items-center justify-center overflow-hidden rounded-sm font-medium text-xs transition-all duration-200',
              active
                ? 'w-8 bg-foreground px-2 text-background'
                : 'pointer-events-none w-0 px-0 text-foreground/65 opacity-0 hover:bg-muted hover:text-foreground group-focus-within/theme-picker:pointer-events-auto group-focus-within/theme-picker:w-8 group-focus-within/theme-picker:px-2 group-focus-within/theme-picker:opacity-100 group-hover/theme-picker:pointer-events-auto group-hover/theme-picker:w-8 group-hover/theme-picker:px-2 group-hover/theme-picker:opacity-100'
            )}
            key={mode.key}
            onClick={() => onModeChange(mode.key)}
            title={labels[mode.key]}
            type="button"
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="sr-only">{labels[mode.key]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PreviewAssetVisual({
  fullscreen = false,
  imageClassName,
  mode,
  monoClassName,
  name,
  src,
}: {
  fullscreen?: boolean;
  imageClassName: string;
  mode: (typeof previewModes)[number];
  monoClassName: string;
  name: string;
  src: string;
}) {
  const monochrome = mode.key === 'monoDark' || mode.key === 'monoLight';

  if (monochrome) {
    return (
      <div
        aria-label={name}
        className={cn(
          'pointer-events-none shrink-0 select-none',
          monoClassName
        )}
        role="img"
        style={{
          backgroundColor: mode.foreground,
          mask: `url(${src}) center / contain no-repeat`,
          WebkitMask: `url(${src}) center / contain no-repeat`,
        }}
      />
    );
  }

  return (
    // biome-ignore lint/performance/noImgElement: local branding assets stay native to keep this dev route off next/image.
    <img
      alt={name}
      className={cn(
        'pointer-events-none select-none object-contain',
        fullscreen
          ? 'drop-shadow-[0_20px_40px_rgba(0,0,0,0.18)]'
          : 'drop-shadow-[0_20px_35px_rgba(0,0,0,0.14)]',
        imageClassName
      )}
      height={fullscreen ? 520 : 240}
      src={src}
      width={fullscreen ? 1200 : 760}
    />
  );
}
