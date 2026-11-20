import type { WorkspaceStorageProvider } from '@tuturuuu/storage-core/workspace-storage-config';
import { sanitizePathSegments } from '@tuturuuu/utils/storage-path';

export const WEBGL_PACKAGE_ASSET_TYPE = 'webgl-package';
export const WEBGL_PACKAGE_METADATA_KIND = 'webgl-package';
export const WEBGL_PACKAGE_METADATA_VERSION = 2;
const LEGACY_METADATA_VERSION = 1;

export function webglRevisionRoot(archivePath: string, revision: string) {
  const segments = sanitizePathSegments(archivePath);
  if (
    segments?.[0] !== 'external-projects' ||
    segments.at(-2) !== 'webgl-packages' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      revision
    )
  )
    return null;
  return [...segments.slice(0, -1), '_revisions', revision].join('/');
}

export type WebglPackageArtifactFile = {
  contentType: string | null;
  relativePath: string;
  size: number | null;
  sha256?: string;
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
  version:
    | typeof WEBGL_PACKAGE_METADATA_VERSION
    | typeof LEGACY_METADATA_VERSION;
  revision?: string;
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
    (metadata.version !== LEGACY_METADATA_VERSION &&
      metadata.version !== WEBGL_PACKAGE_METADATA_VERSION) ||
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
      if (
        !record ||
        typeof record.relativePath !== 'string' ||
        !record.relativePath ||
        !sanitizePathSegments(record.relativePath)
      ) {
        return null;
      }

      return {
        contentType:
          typeof record.contentType === 'string' ? record.contentType : null,
        relativePath: record.relativePath,
        size: typeof record.size === 'number' ? record.size : null,
        ...(typeof record.sha256 === 'string' &&
        /^[0-9a-f]{64}$/.test(record.sha256)
          ? { sha256: record.sha256 }
          : {}),
      };
    })
    .filter((file): file is WebglPackageArtifactFile => Boolean(file));

  if (
    !files.some((file) => file.relativePath === metadata.entryRelativePath) ||
    new Set(files.map((file) => file.relativePath)).size !== files.length
  )
    return null;

  const revision =
    typeof metadata.revision === 'string' ? metadata.revision : undefined;
  if (metadata.version === WEBGL_PACKAGE_METADATA_VERSION) {
    const root = revision && webglRevisionRoot(metadata.archivePath, revision);
    if (
      !root ||
      !sanitizePathSegments(metadata.rootPath) ||
      (metadata.rootPath !== root &&
        !metadata.rootPath.startsWith(`${root}/`)) ||
      files.length !== metadata.files.length ||
      files.some(
        ({ sha256, size }) =>
          !sha256 || !Number.isSafeInteger(size) || size === null || size < 0
      )
    )
      return null;
  }

  return {
    archivePath: metadata.archivePath,
    assetUrls,
    entryRelativePath: metadata.entryRelativePath,
    entryUrl: metadata.entryUrl,
    files,
    kind: WEBGL_PACKAGE_METADATA_KIND,
    provider: metadata.provider,
    rootPath: metadata.rootPath,
    version: metadata.version,
    ...(revision ? { revision } : {}),
  };
}
