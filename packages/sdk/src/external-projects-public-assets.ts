import type {
  ExternalProjectSyncAsset,
  ExternalProjectSyncEntry,
  ExternalProjectSyncManifest,
} from './types';

type PublicAssetMetadata = Record<string, unknown> & {
  localAssetPath?: unknown;
  publicPath?: unknown;
  sourcePublicPath?: unknown;
};

type PublicAssetWithPath = ExternalProjectSyncAsset & {
  publicPath?: string | null;
};

export type ExternalProjectPublicAssetUpload = {
  collectionSlug: string;
  entrySlug: string;
  filename: string;
  publicPath: string;
  stableSourceId: string | null;
  storagePath: string;
};

function cloneManifest(manifest: ExternalProjectSyncManifest) {
  return structuredClone(manifest);
}

function normalizePublicPath(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed) || !trimmed.startsWith('/')) {
    return null;
  }

  const segments = trimmed.split('/').filter(Boolean);
  if (segments.length === 0 || segments.includes('..')) {
    return null;
  }

  return `/${segments.filter((segment) => segment !== '.').join('/')}`;
}

export function getExternalProjectPublicAssetFilename(publicPath: string) {
  return publicPath.split('/').filter(Boolean).at(-1) ?? 'asset';
}

export function getExternalProjectPublicAssetUploads(
  manifest: ExternalProjectSyncManifest
) {
  const uploads: Array<{
    asset: ExternalProjectSyncAsset;
    entry: ExternalProjectSyncEntry;
    publicPath: string;
  }> = [];

  for (const entry of manifest.content.entries) {
    for (const asset of entry.assets ?? []) {
      const publicPath = getExternalProjectPublicAssetPublicPath(
        asset as PublicAssetWithPath
      );
      if (publicPath) {
        uploads.push({ asset, entry, publicPath });
      }
    }
  }

  return uploads;
}

export function getExternalProjectPublicAssetPublicPath(
  asset: PublicAssetWithPath
) {
  const metadata = (asset.metadata ?? {}) as PublicAssetMetadata;

  return (
    normalizePublicPath(asset.publicPath) ??
    normalizePublicPath(metadata.publicPath) ??
    normalizePublicPath(metadata.localAssetPath) ??
    normalizePublicPath(metadata.sourcePublicPath) ??
    normalizePublicPath(asset.sourceUrl)
  );
}

export function getExternalProjectPublicAssetStoragePath({
  adapter,
  collectionSlug,
  entrySlug,
  publicPath,
}: {
  adapter: string;
  collectionSlug: string;
  entrySlug: string;
  publicPath: string;
}) {
  return [
    'external-projects',
    adapter,
    collectionSlug,
    entrySlug,
    getExternalProjectPublicAssetFilename(publicPath),
  ].join('/');
}

export function linkExternalProjectPublicFolderAssets(
  manifestInput: ExternalProjectSyncManifest
) {
  const manifest = cloneManifest(manifestInput);

  for (const {
    asset,
    entry,
    publicPath,
  } of getExternalProjectPublicAssetUploads(manifest)) {
    asset.metadata = {
      ...(asset.metadata ?? {}),
      publicPath,
    };
    asset.sourceUrl = null;
    asset.storagePath = getExternalProjectPublicAssetStoragePath({
      adapter: manifest.adapter,
      collectionSlug: entry.collectionSlug,
      entrySlug: entry.slug,
      publicPath,
    });
  }

  return manifest;
}
