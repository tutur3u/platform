import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { EpmClient } from './epm';
import {
  type ExternalProjectPublicAssetUpload,
  getExternalProjectPublicAssetFilename,
  getExternalProjectPublicAssetStoragePath,
  getExternalProjectPublicAssetUploads,
  linkExternalProjectPublicFolderAssets,
} from './external-projects-public-assets';
import type { ExternalProjectSyncManifest } from './types';

export type { ExternalProjectPublicAssetUpload } from './external-projects-public-assets';
export {
  getExternalProjectPublicAssetFilename,
  getExternalProjectPublicAssetPublicPath,
  getExternalProjectPublicAssetStoragePath,
  getExternalProjectPublicAssetUploads,
  linkExternalProjectPublicFolderAssets,
} from './external-projects-public-assets';

export type ExternalProjectPublicAssetSyncResult = {
  manifest: ExternalProjectSyncManifest;
  skipped: ExternalProjectPublicAssetUpload[];
  uploaded: ExternalProjectPublicAssetUpload[];
};

export type ExternalProjectPublicAssetSyncOptions = {
  fetch?: typeof fetch;
  publicDir?: string;
  upsert?: boolean;
};

const CONTENT_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.webp': 'image/webp',
};

function contentTypeForPath(publicPath: string) {
  return (
    CONTENT_TYPES[extname(publicPath).toLowerCase()] ??
    'application/octet-stream'
  );
}

function resolvePublicFilePath(publicDir: string, publicPath: string) {
  const publicRoot = resolve(publicDir);
  const filePath = resolve(publicRoot, publicPath.slice(1));
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) {
    throw new Error(
      `Refusing to read public asset outside publicDir: ${publicPath}`
    );
  }

  return filePath;
}

export async function uploadExternalProjectPublicFolderAssets(
  client: EpmClient,
  workspaceId: string,
  manifestInput: ExternalProjectSyncManifest,
  options: ExternalProjectPublicAssetSyncOptions = {}
): Promise<ExternalProjectPublicAssetSyncResult> {
  const manifest = linkExternalProjectPublicFolderAssets(manifestInput);
  const publicDir = options.publicDir ?? resolve(process.cwd(), 'public');
  const uploaded: ExternalProjectPublicAssetUpload[] = [];
  const skipped: ExternalProjectPublicAssetUpload[] = [];

  for (const {
    asset,
    entry,
    publicPath,
  } of getExternalProjectPublicAssetUploads(manifest)) {
    const upload = {
      collectionSlug: entry.collectionSlug,
      entrySlug: entry.slug,
      filename: getExternalProjectPublicAssetFilename(publicPath),
      publicPath,
      stableSourceId: asset.stableSourceId ?? null,
      storagePath:
        asset.storagePath ??
        getExternalProjectPublicAssetStoragePath({
          adapter: manifest.adapter,
          collectionSlug: entry.collectionSlug,
          entrySlug: entry.slug,
          publicPath,
        }),
    } satisfies ExternalProjectPublicAssetUpload;

    let file: Buffer;
    try {
      file = await readFile(resolvePublicFilePath(publicDir, publicPath));
    } catch {
      skipped.push(upload);
      continue;
    }

    const contentType = contentTypeForPath(publicPath);
    await client.uploadAssetFile(
      workspaceId,
      new File([new Uint8Array(file)], upload.filename, {
        type: contentType,
      }),
      {
        collectionType: entry.collectionSlug,
        entrySlug: entry.slug,
        upsert: options.upsert ?? true,
      }
    );

    uploaded.push(upload);
  }

  return { manifest, skipped, uploaded };
}
