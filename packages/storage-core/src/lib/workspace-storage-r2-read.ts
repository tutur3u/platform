import 'server-only';

import { posix } from 'node:path';
import {
  CopyObjectCommand,
  type GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  EMPTY_FOLDER_PLACEHOLDER_NAME,
  type StorageObject,
} from '@tuturuuu/types/primitives/StorageObject';
import {
  filterDriveListingEntries,
  isExcludedDrivePath,
} from './drive-path-policy';
import { readStorageUsageBytes } from './storage-quota';
import { getStorageLimit } from './storage-quota-reader';
import { WORKSPACE_STORAGE_PROVIDER_R2 } from './workspace-storage-config';
import { buildWorkspaceStoragePrefix } from './workspace-storage-keys';
import { matchesSearch, sortStorageObjects } from './workspace-storage-listing';
import type {
  R2ListEntry,
  ResolvedWorkspaceStorageConfig,
  WorkspaceStorageListOptions,
  WorkspaceStorageListResult,
  WorkspaceStorageOverview,
} from './workspace-storage-provider-types';

export const R2_SIGNED_URL_TTL_SECONDS = 900;
type SignedUrlClient = Parameters<typeof getSignedUrl>[0];
type SignedUrlCommand = Parameters<typeof getSignedUrl>[1];
type SignedUrlOptions = Parameters<typeof getSignedUrl>[2];

export function createR2Client(
  config: Extract<
    ResolvedWorkspaceStorageConfig,
    {
      provider: 'r2';
    }
  >
) {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function createR2SignedUrl(
  client: S3Client,
  command: GetObjectCommand | PutObjectCommand,
  options: SignedUrlOptions
): Promise<string> {
  // Bun can install AWS packages against duplicate Smithy type patch versions.
  return getSignedUrl(
    client as unknown as SignedUrlClient,
    command as unknown as SignedUrlCommand,
    options
  );
}

export function mapR2FileToStorageObject(entry: R2ListEntry): StorageObject {
  return {
    id: entry.etag ? `${entry.key}:${entry.etag}` : entry.key,
    name: entry.name,
    created_at: entry.createdAt ?? undefined,
    updated_at: entry.updatedAt ?? undefined,
    metadata: {
      size: entry.size ?? 0,
      eTag: entry.etag,
    },
  };
}

export function mapR2FolderToStorageObject(name: string): StorageObject {
  return {
    name,
    metadata: {},
  };
}

export function buildR2CopySource(bucket: string, key: string) {
  return encodeURIComponent(`${bucket}/${key}`).replace(/%2F/g, '/');
}

export function isNotFoundError(error: unknown) {
  const code =
    typeof error === 'object' && error && 'name' in error
      ? String((error as { name?: string }).name)
      : '';

  return code === 'NotFound' || code === 'NoSuchKey';
}

export async function listR2Directory(
  wsId: string,
  config: Extract<ResolvedWorkspaceStorageConfig, { provider: 'r2' }>,
  options: WorkspaceStorageListOptions
): Promise<WorkspaceStorageListResult> {
  const client = createR2Client(config);
  const prefix = buildWorkspaceStoragePrefix(wsId, options.path);
  const folders = new Map<string, StorageObject>();
  const files: StorageObject[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        Delimiter: '/',
        ContinuationToken: continuationToken,
      })
    );

    for (const commonPrefix of response.CommonPrefixes ?? []) {
      const folderPrefix = commonPrefix.Prefix ?? '';
      const folderName = folderPrefix.slice(prefix.length).replace(/\/$/, '');

      if (!folderName || !matchesSearch(folderName, options.search)) {
        continue;
      }

      folders.set(folderName, mapR2FolderToStorageObject(folderName));
    }

    for (const item of response.Contents ?? []) {
      const key = item.Key ?? '';
      const name = key.slice(prefix.length);

      if (!name || name === EMPTY_FOLDER_PLACEHOLDER_NAME) {
        continue;
      }

      if (!matchesSearch(name, options.search)) {
        continue;
      }

      files.push(
        mapR2FileToStorageObject({
          key,
          name,
          createdAt: item.LastModified?.toISOString(),
          updatedAt: item.LastModified?.toISOString(),
          size: item.Size ?? 0,
          etag: item.ETag ?? null,
        })
      );
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  const sorted = sortStorageObjects(
    filterDriveListingEntries(
      wsId,
      options.path ?? '',
      [...folders.values(), ...files],
      options.serviceRoot
    ),
    options.sortBy ?? 'name',
    options.sortOrder ?? 'asc'
  );

  const offset = options.offset ?? 0;
  const limit = options.limit ?? sorted.length;

  return {
    data: sorted.slice(offset, offset + limit),
    total: sorted.length,
    hasMore: offset + limit < sorted.length,
    provider: WORKSPACE_STORAGE_PROVIDER_R2,
  };
}

export async function getR2Overview(
  wsId: string,
  config: Extract<ResolvedWorkspaceStorageConfig, { provider: 'r2' }>,
  includeReservedForQuota = false
): Promise<WorkspaceStorageOverview> {
  const client = createR2Client(config);
  const prefix = buildWorkspaceStoragePrefix(wsId);
  const storageLimit = await getStorageLimit(wsId);
  let continuationToken: string | undefined;
  let totalSize = 0;
  let fileCount = 0;
  let largestFile: WorkspaceStorageOverview['largestFile'] = null;
  let smallestFile: WorkspaceStorageOverview['smallestFile'] = null;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const item of response.Contents ?? []) {
      const key = item.Key ?? '';
      const relativeKey = key.slice(prefix.length);

      if (!relativeKey || relativeKey.endsWith(EMPTY_FOLDER_PLACEHOLDER_NAME)) {
        continue;
      }

      if (!includeReservedForQuota && isExcludedDrivePath(wsId, relativeKey)) {
        continue;
      }

      const size = readStorageUsageBytes(item.Size);
      const record = {
        name: posix.basename(relativeKey),
        size,
        createdAt: item.LastModified?.toISOString(),
      };

      totalSize += size;
      fileCount += 1;

      if (!largestFile || size > largestFile.size) {
        largestFile = record;
      }

      if (!smallestFile || size < smallestFile.size) {
        smallestFile = record;
      }
    }

    if (response.IsTruncated && !response.NextContinuationToken)
      throw new Error('Storage usage listing is incomplete');
    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return {
    provider: WORKSPACE_STORAGE_PROVIDER_R2,
    totalSize,
    fileCount,
    largestFile,
    smallestFile,
    storageLimit,
  };
}

export async function hasR2Object(
  client: S3Client,
  bucket: string,
  key: string
): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}
export async function copyR2Object(
  client: S3Client,
  bucket: string,
  sourceKey: string,
  destinationKey: string
) {
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: buildR2CopySource(bucket, sourceKey),
      Key: destinationKey,
    })
  );
}
