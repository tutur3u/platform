'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, ZoomIn, ZoomOut } from '@tuturuuu/icons';
import { createWorkspaceStorageShareLink } from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import { FloatingBar, FloatingBarSeparator } from '@tuturuuu/ui/floating-bar';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  getDriveObjectPath,
  getSignedLinkStaleTime,
  SIGNED_LINK_GC_TIME_MS,
  SIGNED_LINK_TTL_SECONDS,
} from './drive-download';
import { getDriveFileKind } from './drive-file-kind';
import {
  fetchPreviewText,
  isTextTooLargeToPreview,
  PreviewTooLargeError,
} from './drive-preview-text';
import { FilePreviewRenderer } from './file-preview-renderer';
import { getFileType } from './file-preview-utils';
import { getStorageObjectDisplayName } from './storage-display-name';

export const DRIVE_ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

export function stepZoom(current: number, direction: 1 | -1) {
  if (direction === 1) {
    return (
      DRIVE_ZOOM_STEPS.find((step) => step > current) ?? DRIVE_ZOOM_STEPS[7]
    );
  }
  return (
    [...DRIVE_ZOOM_STEPS].reverse().find((step) => step < current) ??
    DRIVE_ZOOM_STEPS[0]
  );
}

export function useDrivePreviewUrl(
  wsId: string,
  path: string,
  file: StorageObject
) {
  const objectPath = getDriveObjectPath(path, file);
  return useQuery({
    queryKey: ['drive-file-preview-url', wsId, objectPath],
    queryFn: () =>
      createWorkspaceStorageShareLink(
        wsId,
        objectPath,
        { expiresIn: SIGNED_LINK_TTL_SECONDS },
        { fetch }
      ),
    staleTime: (query) => getSignedLinkStaleTime(query.state.data?.expiresIn),
    gcTime: SIGNED_LINK_GC_TIME_MS,
    retry: 1,
    select: (link) => link.url,
  });
}

function ImagePreview({ name, url }: { name: string; url: string }) {
  const t = useTranslations('drive');
  // null is "fit to the viewer"; a number is an explicit scale.
  const [zoom, setZoom] = useState<number | null>(null);
  const scale = zoom ?? 1;

  return (
    <figure className="relative flex size-full min-h-0 flex-col items-center justify-center">
      <div className="flex size-full min-h-0 items-center justify-center overflow-auto">
        <img
          alt={name}
          className={
            zoom === null
              ? 'max-h-full max-w-full object-contain'
              : 'max-w-none'
          }
          draggable={false}
          src={url}
          style={zoom === null ? undefined : { width: `${scale * 100}%` }}
        />
      </div>
      <FloatingBar
        aria-label={t('preview.zoom_label')}
        className="absolute bottom-4"
      >
        <Button
          aria-label={t('preview.zoom_out')}
          disabled={scale <= DRIVE_ZOOM_STEPS[0]}
          onClick={() => setZoom(stepZoom(scale, -1))}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ZoomOut className="size-4" />
        </Button>
        <span
          aria-live="polite"
          className="w-12 text-center text-sm tabular-nums"
        >
          {zoom === null ? t('preview.fit') : `${Math.round(scale * 100)}%`}
        </span>
        <Button
          aria-label={t('preview.zoom_in')}
          disabled={scale >= DRIVE_ZOOM_STEPS[7]}
          onClick={() => setZoom(stepZoom(scale, 1))}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ZoomIn className="size-4" />
        </Button>
        <FloatingBarSeparator />
        <Button
          disabled={zoom === null}
          onClick={() => setZoom(null)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t('preview.fit')}
        </Button>
      </FloatingBar>
    </figure>
  );
}

export function DrivePreviewMedia({
  file,
  onDownload,
  path,
  wsId,
}: {
  file: StorageObject;
  onDownload: () => void;
  path: string;
  wsId: string;
}) {
  const t = useTranslations('drive');
  const name = getStorageObjectDisplayName(file);
  const urlQuery = useDrivePreviewUrl(wsId, path, file);
  const fileType = getFileType(file.name ?? '');
  const isText = fileType === 'text' || fileType === 'code';
  const textTooLarge = isText && isTextTooLargeToPreview(file);
  const textQuery = useQuery({
    // The signed URL rotates; the text belongs to the object, not the link.
    queryKey: ['drive-file-preview-text', wsId, getDriveObjectPath(path, file)],
    queryFn: () => fetchPreviewText(urlQuery.data ?? ''),
    enabled: isText && !textTooLarge && Boolean(urlQuery.data),
    retry: (count, error) =>
      !(error instanceof PreviewTooLargeError) && count < 1,
  });
  // Oversized text falls through to the renderer's Download fallback.
  const previewType =
    textTooLarge || textQuery.error instanceof PreviewTooLargeError
      ? 'other'
      : fileType;

  if (urlQuery.isPending) {
    return (
      <div className="flex size-full items-center justify-center" role="status">
        <Loader2
          aria-hidden
          className="size-8 animate-spin text-muted-foreground"
        />
        <span className="sr-only">{t('states.loading')}</span>
      </div>
    );
  }
  if (urlQuery.data && getDriveFileKind(file) === 'image') {
    // Remount per file so each one opens fitted.
    return <ImagePreview key={file.id} name={name} url={urlQuery.data} />;
  }

  return (
    <div className="flex size-full min-h-0 flex-col overflow-auto">
      <FilePreviewRenderer
        cleanFileName={name}
        fileType={previewType}
        loading={previewType !== 'other' && isText && textQuery.isPending}
        onDownload={onDownload}
        onOpenExternal={() =>
          urlQuery.data && window.open(urlQuery.data, '_blank', 'noopener')
        }
        signedUrl={urlQuery.data ?? null}
        textContent={textQuery.data ?? ''}
      />
    </div>
  );
}
