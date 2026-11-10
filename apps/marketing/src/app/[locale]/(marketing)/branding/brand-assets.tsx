'use client';

import { Check, Copy, Download } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { PreviewLabels, PreviewMode } from './brand-data';
import { BrandPreview } from './brand-preview';

/** A downloadable asset, its product mark, and the copy/download controls. */

export function AssetPanel({
  copied,
  copiedLabel,
  copyLabel,
  defaultMode,
  downloadLabel,
  imageClassName,
  locked,
  monoClassName,
  name,
  onCopy,
  previewLabels,
  src,
}: {
  copied: boolean;
  copiedLabel: string;
  copyLabel: string;
  defaultMode: PreviewMode;
  downloadLabel: string;
  imageClassName: string;
  locked: boolean;
  monoClassName: string;
  name: string;
  onCopy: () => void;
  previewLabels: PreviewLabels;
  src: string;
}) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>(defaultMode);

  return (
    <motion.div
      className="overflow-hidden rounded-lg border border-border bg-background"
      initial={{ opacity: 0, y: 28 }}
      transition={{ duration: 0.45 }}
      viewport={{ once: true, margin: '-90px' }}
      whileHover={{ scale: 1.01, y: -4 }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <BrandPreview
        imageClassName={imageClassName}
        labels={previewLabels}
        locked={locked}
        mode={previewMode}
        monoClassName={monoClassName}
        name={name}
        onModeChange={setPreviewMode}
        previewClassName="min-h-[22rem]"
        src={src}
        wide
      />
      <AssetActions
        copied={copied}
        copiedLabel={copiedLabel}
        copyLabel={copyLabel}
        downloadLabel={downloadLabel}
        name={name}
        onCopy={onCopy}
        src={src}
      />
    </motion.div>
  );
}

export function ProductMark({
  copied,
  copiedLabel,
  copyLabel,
  downloadLabel,
  frameClassName,
  imageClassName,
  index,
  monoClassName,
  name,
  onCopy,
  previewLabels,
  src,
}: {
  copied: boolean;
  copiedLabel: string;
  copyLabel: string;
  downloadLabel: string;
  frameClassName: string;
  imageClassName: string;
  index: number;
  monoClassName: string;
  name: string;
  onCopy: () => void;
  previewLabels: PreviewLabels;
  src: string;
}) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('dark');

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotate: index % 2 === 0 ? -1.5 : 1.5 }}
      transition={{ delay: index * 0.05, duration: 0.45 }}
      viewport={{ once: true, margin: '-80px' }}
      whileHover={{ rotate: 0, scale: 1.015, y: -4 }}
      whileInView={{ opacity: 1, y: 0 }}
      className={cn(
        'group relative grid grid-rows-[1fr_auto] overflow-hidden rounded-lg border border-border bg-background p-5',
        frameClassName
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--border)_0_1px,transparent_1px_32px)] opacity-70" />
      <BrandPreview
        imageClassName={imageClassName}
        labels={previewLabels}
        mode={previewMode}
        monoClassName={monoClassName}
        name={name}
        onModeChange={setPreviewMode}
        previewClassName="min-h-0"
        src={src}
      />
      <div className="relative mt-auto flex items-center justify-between gap-3 border-border border-t pt-4">
        <h3 className="font-semibold text-lg">{name}</h3>
        <div className="flex gap-2">
          <Button
            aria-label={copied ? copiedLabel : copyLabel}
            onClick={onCopy}
            size="icon"
            type="button"
            variant="outline"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button asChild size="icon" variant="secondary">
            <a aria-label={downloadLabel} download href={src}>
              <Download className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export function AssetActions({
  copied,
  copiedLabel,
  copyLabel,
  downloadLabel,
  name,
  onCopy,
  src,
}: {
  copied: boolean;
  copiedLabel: string;
  copyLabel: string;
  downloadLabel: string;
  name: string;
  onCopy: () => void;
  src: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-border border-t p-5 sm:flex-row sm:items-center sm:justify-between">
      <h3 className="font-semibold text-xl">{name}</h3>
      <div className="flex gap-2">
        <Button
          aria-label={copied ? copiedLabel : copyLabel}
          onClick={onCopy}
          size="icon"
          type="button"
          variant="outline"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        <Button asChild size="sm" variant="secondary">
          <a download href={src}>
            <Download className="mr-2 h-4 w-4" />
            {downloadLabel}
          </a>
        </Button>
      </div>
    </div>
  );
}
