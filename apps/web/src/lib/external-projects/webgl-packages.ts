import 'server-only';

import { posix } from 'node:path';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import type { WorkspaceStorageProvider } from '../workspace-storage-config';

export const WEBGL_PACKAGE_ASSET_TYPE = 'webgl-package';
export const WEBGL_PACKAGE_METADATA_KIND = 'webgl-package';
export const WEBGL_PACKAGE_METADATA_VERSION = 1;

export class WebglPackageError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'WebglPackageError';
  }
}

type WebglPackageFile = {
  contentType?: string | null;
  path: string;
  size?: number | null;
};

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

const ZIP_CONTENT_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

const WEBGL_CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.data': 'application/octet-stream',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.wasm': 'application/wasm',
};

function encodeRelativePathForUrl(value: string) {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizeContentType(value?: string | null) {
  const normalized = value?.split(';')[0]?.trim().toLowerCase();
  return normalized || null;
}

function stripCompressionExtension(path: string) {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith('.br')) {
    return {
      contentEncoding: 'br' as const,
      path: path.slice(0, -3),
    };
  }

  if (lowerPath.endsWith('.gz')) {
    return {
      contentEncoding: 'gzip' as const,
      path: path.slice(0, -3),
    };
  }

  return {
    contentEncoding: undefined,
    path,
  };
}

function getRelativePath(rootPath: string, filePath: string) {
  if (filePath === rootPath) {
    return '';
  }

  return filePath.startsWith(`${rootPath}/`)
    ? filePath.slice(rootPath.length + 1)
    : '';
}

function normalizeFilePaths(files: WebglPackageFile[]) {
  return files
    .map((file) => {
      const path = sanitizePath(file.path);
      return path
        ? {
            ...file,
            path,
          }
        : null;
    })
    .filter((file): file is WebglPackageFile & { path: string } =>
      Boolean(file)
    )
    .sort((left, right) => {
      if (left.path.endsWith('/index.html')) return -1;
      if (right.path.endsWith('/index.html')) return 1;
      return 0;
    });
}

function findWebglRootPath(files: Array<WebglPackageFile & { path: string }>) {
  const indexCandidates = files
    .map((file) => file.path)
    .filter((path) => path.toLowerCase().endsWith('/index.html'));

  if (indexCandidates.length === 0) {
    throw new WebglPackageError(
      'WebGL package must contain an index.html file.',
      400
    );
  }

  const exactRootIndex = indexCandidates.find((path) => {
    const dirname = posix.dirname(path);
    return files.every(
      (file) => file.path === dirname || file.path.startsWith(`${dirname}/`)
    );
  });
  const entryPath = exactRootIndex ?? indexCandidates[0];

  if (!entryPath) {
    throw new WebglPackageError(
      'WebGL package must contain an index.html file.',
      400
    );
  }

  return posix.dirname(entryPath);
}

export function isWebglZipUpload(input: {
  contentType?: string | null;
  filename?: string | null;
}) {
  const lowerFilename = input.filename?.trim().toLowerCase() ?? '';
  if (lowerFilename.endsWith('.zip')) {
    return true;
  }

  const contentType = normalizeContentType(input.contentType);
  return contentType ? ZIP_CONTENT_TYPES.has(contentType) : false;
}

export function buildWebglPackageArtifact(input: {
  archivePath: string;
  assetId: string;
  files: WebglPackageFile[];
  provider: WorkspaceStorageProvider;
  wsId: string;
}): WebglPackageArtifactMetadata {
  const archivePath = sanitizePath(input.archivePath);
  if (!archivePath) {
    throw new WebglPackageError('Invalid WebGL archive path.', 400);
  }

  const files = normalizeFilePaths(input.files);
  const rootPath = findWebglRootPath(files);
  const artifactFiles = files
    .map((file) => {
      const relativePath = getRelativePath(rootPath, file.path);
      return relativePath
        ? {
            contentType: file.contentType ?? null,
            relativePath,
            size: typeof file.size === 'number' ? file.size : null,
          }
        : null;
    })
    .filter((file): file is WebglPackageArtifactFile => Boolean(file));

  const entryRelativePath = 'index.html';
  if (
    !artifactFiles.some(
      (file) => file.relativePath.toLowerCase() === entryRelativePath
    )
  ) {
    throw new WebglPackageError(
      'WebGL package must contain an index.html file.',
      400
    );
  }

  const assetUrls = Object.fromEntries(
    artifactFiles.map((file) => [
      file.relativePath,
      `/api/v1/workspaces/${encodeURIComponent(input.wsId)}/external-projects/assets/${encodeURIComponent(input.assetId)}/webgl/${encodeRelativePathForUrl(file.relativePath)}`,
    ])
  );
  const entryUrl = assetUrls[entryRelativePath];

  if (!entryUrl) {
    throw new WebglPackageError(
      'WebGL package must contain an index.html file.',
      400
    );
  }

  return {
    archivePath,
    assetUrls,
    entryRelativePath,
    entryUrl,
    files: artifactFiles,
    kind: WEBGL_PACKAGE_METADATA_KIND,
    provider: input.provider,
    rootPath,
    version: WEBGL_PACKAGE_METADATA_VERSION,
  };
}

export function inferWebglAssetHeaders(relativePath: string): {
  contentEncoding?: 'br' | 'gzip';
  isKnownType: boolean;
  contentType: string;
} {
  const compressed = stripCompressionExtension(relativePath);
  const extension = posix.extname(compressed.path).toLowerCase();
  const contentType = WEBGL_CONTENT_TYPES[extension];

  return {
    contentEncoding: compressed.contentEncoding,
    contentType: contentType ?? 'application/octet-stream',
    isKnownType: Boolean(contentType),
  };
}

export function buildWebglPackageDestinationPrefix(archivePath: string) {
  const sanitizedPath = sanitizePath(archivePath);
  if (!sanitizedPath) {
    throw new WebglPackageError('Invalid WebGL archive path.', 400);
  }

  const extension = posix.extname(sanitizedPath);
  const basename = posix.basename(sanitizedPath, extension);
  const dirname = posix.dirname(sanitizedPath);

  if (!basename) {
    throw new WebglPackageError('Invalid WebGL archive path.', 400);
  }

  return dirname === '.' ? basename : posix.join(dirname, basename);
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
