'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText, Folder, Image as ImageIcon, Loader2 } from '@tuturuuu/icons';
import { createWorkspaceStorageSignedUrl } from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { useState } from 'react';
import { joinPath } from '@/utils/path-helper';

const IMAGE_MIME_PREFIX = 'image/';
const imageExtensions = new Set([
  'apng',
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp',
]);

function getMetadataMimeType(item: StorageObject): string | null {
  const metadata = item.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const mimeFromMetadata =
    (metadata.mimetype as string | undefined) ||
    (metadata.mimeType as string | undefined) ||
    (metadata.mediaType as string | undefined);

  if (!mimeFromMetadata || typeof mimeFromMetadata !== 'string') {
    return null;
  }

  return mimeFromMetadata.toLowerCase();
}

function isImageFile(item: StorageObject): boolean {
  const mimeType = getMetadataMimeType(item);
  if (mimeType?.startsWith(IMAGE_MIME_PREFIX)) {
    return true;
  }

  const fileName = item.name;
  if (!fileName) {
    return false;
  }

  const extension = fileName.split('.').pop()?.toLowerCase();
  if (!extension) {
    return false;
  }

  return imageExtensions.has(extension);
}

interface DriveGridThumbnailProps {
  wsId: string;
  path?: string;
  item: StorageObject;
}

export function DriveGridThumbnail({
  wsId,
  path = '',
  item,
}: DriveGridThumbnailProps) {
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const isFile = Boolean(item.id && item.name);
  const isFolder = !item.id;
  const showImagePreview = isFile && isImageFile(item);
  const relativePath = item.name ? joinPath(path, item.name) : '';

  const thumbnailQuery = useQuery({
    queryKey: ['drive-grid-thumbnail', wsId, relativePath],
    queryFn: async () => {
      if (!relativePath) {
        throw new Error('Missing file path');
      }

      return createWorkspaceStorageSignedUrl(wsId, relativePath, 3600);
    },
    enabled: showImagePreview && !!relativePath,
    staleTime: 50 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (isFolder) {
    return <Folder className="h-10 w-10 text-muted-foreground" />;
  }

  if (!showImagePreview) {
    return <FileText className="h-10 w-10 text-muted-foreground" />;
  }

  if (imageLoadFailed) {
    return <ImageIcon className="h-10 w-10 text-muted-foreground" />;
  }

  if (thumbnailQuery.isPending) {
    return <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />;
  }

  if (!thumbnailQuery.data) {
    return <ImageIcon className="h-10 w-10 text-muted-foreground" />;
  }

  return (
    // biome-ignore lint/performance/noImgElement: signed storage URLs are runtime-only
    <img
      src={thumbnailQuery.data}
      alt={item.name || 'File thumbnail'}
      className="h-full w-full rounded-lg object-cover"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setImageLoadFailed(true)}
    />
  );
}
