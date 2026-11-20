import type { WorkspaceStorageProvider } from '@tuturuuu/storage-core/workspace-storage-config';

export const WEBGL_PACKAGE_ASSET_TYPE = 'webgl-package';
export const WEBGL_PACKAGE_METADATA_KIND = 'webgl-package';
export const WEBGL_PACKAGE_METADATA_VERSION = 1;

export type WebglPackageArtifactFile = {
  contentType: string | null;
  relativePath: string;
  size: number | null;
};

export type WebglPackageArtifactMetadata = {
  archivePath: string;
  assetUrls: Record<string, string>;
  entryRelativePath: string;
  entryUrl: string;
  files: WebglPackageArtifactFile[];
  kind: typeof WEBGL_PACKAGE_METADATA_KIND;
  provider: WorkspaceStorageProvider;
  rootPath: string;
  version: typeof WEBGL_PACKAGE_METADATA_VERSION;
};

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseWebglPackageArtifactMetadata(
  value: unknown
): WebglPackageArtifactMetadata | null {
  const metadata = asRecord(value);
  if (!metadata) {
    return null;
  }

  const assetUrlsRecord = asRecord(metadata.assetUrls);

  if (
    metadata.kind !== WEBGL_PACKAGE_METADATA_KIND ||
    metadata.version !== WEBGL_PACKAGE_METADATA_VERSION ||
    (metadata.provider !== 'supabase' && metadata.provider !== 'r2') ||
    typeof metadata.archivePath !== 'string' ||
    typeof metadata.rootPath !== 'string' ||
    typeof metadata.entryRelativePath !== 'string' ||
    typeof metadata.entryUrl !== 'string' ||
    !assetUrlsRecord ||
    !Array.isArray(metadata.files)
  ) {
    return null;
  }

  const assetUrls = Object.fromEntries(
    Object.entries(assetUrlsRecord).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === 'string' && typeof entry[1] === 'string'
    )
  );
  const files = metadata.files
    .map((file) => {
      const record = asRecord(file);
      if (!record || typeof record.relativePath !== 'string') {
        return null;
      }

      return {
        contentType:
          typeof record.contentType === 'string' ? record.contentType : null,
        relativePath: record.relativePath,
        size: typeof record.size === 'number' ? record.size : null,
      };
    })
    .filter((file): file is WebglPackageArtifactFile => Boolean(file));

  return {
    archivePath: metadata.archivePath,
    assetUrls,
    entryRelativePath: metadata.entryRelativePath,
    entryUrl: metadata.entryUrl,
    files,
    kind: WEBGL_PACKAGE_METADATA_KIND,
    provider: metadata.provider,
    rootPath: metadata.rootPath,
    version: WEBGL_PACKAGE_METADATA_VERSION,
  };
}
