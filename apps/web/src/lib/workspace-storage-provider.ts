import 'server-only';

import { posix } from 'node:path';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  EMPTY_FOLDER_PLACEHOLDER_NAME,
  type StorageObject,
} from '@tuturuuu/types/primitives/StorageObject';
import {
  sanitizeFilename,
  sanitizeFolderName,
  sanitizePath,
} from '@tuturuuu/utils/storage-path';
import { getSecrets } from '@tuturuuu/utils/workspace-helper';
import { getWorkspaceStorageMetrics } from './storage-analytics';
import {
  DRIVE_R2_ACCESS_KEY_ID_SECRET,
  DRIVE_R2_BUCKET_SECRET,
  DRIVE_R2_ENDPOINT_SECRET,
  DRIVE_R2_SECRET_ACCESS_KEY_SECRET,
  DRIVE_STORAGE_PROVIDER_SECRET,
  WORKSPACE_STORAGE_PROVIDER_OPTIONS,
  WORKSPACE_STORAGE_PROVIDER_R2,
  WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  type WorkspaceStorageProvider,
} from './workspace-storage-config';

const STORAGE_LIMIT_FALLBACK_BYTES = 104857600;
const R2_SIGNED_URL_TTL_SECONDS = 900;
const SUPABASE_STORAGE_LIST_PAGE_SIZE = 1000;

export interface WorkspaceStorageUploadPayload {
  signedUrl: string;
  token?: string;
  headers?: Record<string, string>;
  path: string;
  fullPath: string;
}

export interface WorkspaceStorageOverview {
  provider: WorkspaceStorageProvider;
  totalSize: number;
  fileCount: number;
  largestFile: {
    name: string;
    size: number;
    createdAt?: string | null;
  } | null;
  smallestFile: {
    name: string;
    size: number;
    createdAt?: string | null;
  } | null;
  storageLimit: number;
}

export interface WorkspaceStorageListOptions {
  path?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'created_at' | 'updated_at' | 'size';
  sortOrder?: 'asc' | 'desc';
}

export interface WorkspaceStorageListResult {
  data: StorageObject[];
  total: number;
  provider: WorkspaceStorageProvider;
}

export interface WorkspaceStorageResolvedProvider {
  provider: WorkspaceStorageProvider;
  misconfigured: boolean;
}

export interface WorkspaceStorageRawObject {
  path: string;
  fullPath: string;
  size: number;
  contentType?: string | null;
  updatedAt?: string | null;
  isFolderPlaceholder: boolean;
}

interface WorkspaceStorageRawListOptions {
  pathPrefix?: string;
  limit?: number;
}

export type ResolvedWorkspaceStorageConfig =
  | {
      provider: typeof WORKSPACE_STORAGE_PROVIDER_SUPABASE;
      misconfigured: boolean;
    }
  | {
      provider: typeof WORKSPACE_STORAGE_PROVIDER_R2;
      misconfigured: boolean;
      bucket: string;
      endpoint: string;
      accessKeyId: string;
      secretAccessKey: string;
    };

type R2ListEntry = {
  key: string;
  name: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  size?: number;
  etag?: string | null;
};

export class WorkspaceStorageError extends Error {
  constructor(
    message: string,
    public readonly status = 500
  ) {
    super(message);
    this.name = 'WorkspaceStorageError';
  }
}

function normalizeRelativePath(path = '') {
  const sanitizedPath = sanitizePath(path);

  if (sanitizedPath === null) {
    throw new WorkspaceStorageError('Invalid path', 400);
  }

  return sanitizedPath;
}

function normalizeFilename(filename: string) {
  const sanitizedFilename = sanitizeFilename(filename);

  if (!sanitizedFilename) {
    throw new WorkspaceStorageError('Invalid filename', 400);
  }

  return sanitizedFilename;
}

function normalizeEntryName(name: string) {
  const sanitizedName = sanitizeFolderName(name);

  if (!sanitizedName) {
    throw new WorkspaceStorageError('Invalid entry name', 400);
  }

  return sanitizedName;
}

function buildWorkspaceStorageKey(wsId: string, path = '') {
  const normalizedPath = normalizeRelativePath(path);
  return normalizedPath ? posix.join(wsId, normalizedPath) : wsId;
}

function buildWorkspaceStoragePrefix(wsId: string, path = '') {
  const key = buildWorkspaceStorageKey(wsId, path);
  return key.endsWith('/') ? key : `${key}/`;
}

function stripWorkspaceStoragePrefix(wsId: string, fullPath: string) {
  const prefix = `${wsId}/`;
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}

function createR2Client(
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

function createSecretsMap(
  secrets: Awaited<ReturnType<typeof getSecrets>> | null
): Map<string, string> {
  const map = new Map<string, string>();

  for (const secret of secrets ?? []) {
    if (
      !secret.name ||
      typeof secret.value !== 'string' ||
      map.has(secret.name)
    ) {
      continue;
    }

    map.set(secret.name, secret.value);
  }

  return map;
}

function parseWorkspaceStorageProvider(
  value?: string
): WorkspaceStorageProvider {
  if (!value) {
    return WORKSPACE_STORAGE_PROVIDER_SUPABASE;
  }

  const normalized = value.trim().toLowerCase();
  return WORKSPACE_STORAGE_PROVIDER_OPTIONS.includes(
    normalized as WorkspaceStorageProvider
  )
    ? (normalized as WorkspaceStorageProvider)
    : WORKSPACE_STORAGE_PROVIDER_SUPABASE;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortStorageObjects(
  entries: StorageObject[],
  sortBy: NonNullable<WorkspaceStorageListOptions['sortBy']>,
  sortOrder: NonNullable<WorkspaceStorageListOptions['sortOrder']>
) {
  const factor = sortOrder === 'asc' ? 1 : -1;

  return [...entries].sort((left, right) => {
    const leftFolder = !left.id;
    const rightFolder = !right.id;

    if (leftFolder !== rightFolder) {
      return leftFolder ? -1 : 1;
    }

    if (sortBy === 'size') {
      return (
        factor *
        (toNumber(left.metadata?.size) - toNumber(right.metadata?.size))
      );
    }

    if (sortBy === 'created_at' || sortBy === 'updated_at') {
      const leftValue =
        new Date(
          sortBy === 'created_at'
            ? (left.created_at ?? 0)
            : (left.updated_at ?? 0)
        ).getTime() || 0;
      const rightValue =
        new Date(
          sortBy === 'created_at'
            ? (right.created_at ?? 0)
            : (right.updated_at ?? 0)
        ).getTime() || 0;

      return factor * (leftValue - rightValue);
    }

    return factor * (left.name ?? '').localeCompare(right.name ?? '');
  });
}

function matchesSearch(name: string | undefined, search?: string) {
  const normalizedSearch = search?.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return (name ?? '').toLowerCase().includes(normalizedSearch);
}

function mapR2FileToStorageObject(entry: R2ListEntry): StorageObject {
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

function mapR2FolderToStorageObject(name: string): StorageObject {
  return {
    name,
    metadata: {},
  };
}

function getSupabaseStorageObjectContentType(entry: StorageObject) {
  const metadata = entry.metadata ?? {};
  return (
    metadata.mimetype ??
    metadata.mimeType ??
    metadata.mediaType ??
    metadata.contentType ??
    null
  );
}

function buildR2CopySource(bucket: string, key: string) {
  return encodeURIComponent(`${bucket}/${key}`).replace(/%2F/g, '/');
}

function isNotFoundError(error: unknown) {
  const code =
    typeof error === 'object' && error && 'name' in error
      ? String((error as { name?: string }).name)
      : '';

  return code === 'NotFound' || code === 'NoSuchKey';
}

function resolveWorkspaceStorageConfigForProvider(
  wsId: string,
  secretMap: Map<string, string>,
  provider: WorkspaceStorageProvider
): ResolvedWorkspaceStorageConfig {
  if (provider !== WORKSPACE_STORAGE_PROVIDER_R2) {
    return {
      provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      misconfigured: false,
    };
  }

  const bucket = secretMap.get(DRIVE_R2_BUCKET_SECRET)?.trim();
  const endpoint = secretMap.get(DRIVE_R2_ENDPOINT_SECRET)?.trim();
  const accessKeyId = secretMap.get(DRIVE_R2_ACCESS_KEY_ID_SECRET)?.trim();
  const secretAccessKey = secretMap
    .get(DRIVE_R2_SECRET_ACCESS_KEY_SECRET)
    ?.trim();

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    console.warn(
      `[workspace-storage] Incomplete R2 configuration for workspace ${wsId}. Falling back to Supabase storage.`
    );

    return {
      provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      misconfigured: true,
    };
  }

  return {
    provider: WORKSPACE_STORAGE_PROVIDER_R2,
    misconfigured: false,
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
  };
}

async function resolveWorkspaceStorageConfig(
  wsId: string
): Promise<ResolvedWorkspaceStorageConfig> {
  const secrets = await getSecrets({ wsId, forceAdmin: true });
  const secretMap = createSecretsMap(secrets);
  const provider = parseWorkspaceStorageProvider(
    secretMap.get(DRIVE_STORAGE_PROVIDER_SECRET)
  );

  return resolveWorkspaceStorageConfigForProvider(wsId, secretMap, provider);
}

async function getStorageLimit(
  wsId: string,
  supabase?: TypedSupabaseClient
): Promise<number> {
  const client =
    supabase ?? ((await createDynamicAdminClient()) as TypedSupabaseClient);
  const { data, error } = await client.rpc('get_workspace_storage_limit', {
    p_ws_id: wsId,
  });

  if (error) {
    console.error('Error fetching storage limit:', error);
    return STORAGE_LIMIT_FALLBACK_BYTES;
  }

  return data ?? STORAGE_LIMIT_FALLBACK_BYTES;
}

async function listR2Directory(
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
    [...folders.values(), ...files],
    options.sortBy ?? 'name',
    options.sortOrder ?? 'asc'
  );

  const offset = options.offset ?? 0;
  const limit = options.limit ?? sorted.length;

  return {
    data: sorted.slice(offset, offset + limit),
    total: sorted.length,
    provider: WORKSPACE_STORAGE_PROVIDER_R2,
  };
}

async function getR2Overview(
  wsId: string,
  config: Extract<ResolvedWorkspaceStorageConfig, { provider: 'r2' }>
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

      const size = item.Size ?? 0;
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

async function ensureWorkspaceCapacity(
  wsId: string,
  incomingBytes?: number,
  options?: {
    provider?: WorkspaceStorageProvider;
    fullPath?: string;
    upsert?: boolean;
  }
): Promise<void> {
  if (
    incomingBytes === undefined ||
    !Number.isFinite(incomingBytes) ||
    incomingBytes < 0
  ) {
    throw new WorkspaceStorageError(
      'A valid file size is required for storage uploads.',
      400
    );
  }

  if (incomingBytes === 0) {
    return;
  }

  const overview = await getWorkspaceStorageOverview(wsId);
  let existingBytes = 0;

  if (options?.upsert && options.provider && options.fullPath) {
    if (options.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
      const config = await resolveWorkspaceStorageBackendConfig(
        wsId,
        options.provider
      );

      if (config.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
        try {
          const response = await createR2Client(config).send(
            new HeadObjectCommand({
              Bucket: config.bucket,
              Key: options.fullPath,
            })
          );
          existingBytes = Number(response.ContentLength ?? 0);
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
        }
      }
    } else {
      const supabase = await createDynamicAdminClient();
      const existingObject = await findSupabaseStorageObject(
        supabase as TypedSupabaseClient,
        options.fullPath
      );
      existingBytes = toNumber(existingObject?.metadata?.size);
    }
  }

  if (
    overview.totalSize - existingBytes + incomingBytes >
    overview.storageLimit
  ) {
    throw new WorkspaceStorageError(
      'Workspace storage limit exceeded. Please free up space or upgrade your plan.',
      413
    );
  }
}

async function hasR2Object(
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

async function copyR2Object(
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

async function countSupabaseDirectoryEntries(
  supabase: TypedSupabaseClient,
  storagePath: string,
  search?: string
) {
  let offset = 0;
  let total = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from('workspaces')
      .list(storagePath, {
        limit: SUPABASE_STORAGE_LIST_PAGE_SIZE,
        offset,
        search,
      });

    if (error) {
      throw new WorkspaceStorageError(error.message || 'Failed to list files');
    }

    const page = data ?? [];
    total += page.filter(
      (entry) => entry.name !== EMPTY_FOLDER_PLACEHOLDER_NAME
    ).length;

    if (page.length < SUPABASE_STORAGE_LIST_PAGE_SIZE) {
      return total;
    }

    offset += page.length;
  }
}

async function listSupabaseFolderObjectPathsRecursively(
  supabase: TypedSupabaseClient,
  folderPath: string
): Promise<string[]> {
  const objectPaths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from('workspaces')
      .list(folderPath, {
        limit: SUPABASE_STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: {
          column: 'name',
          order: 'asc',
        },
      });

    if (error) {
      throw new WorkspaceStorageError(
        error.message || 'Failed to list files in folder'
      );
    }

    const page = (data ?? []) as StorageObject[];

    for (const entry of page) {
      if (!entry.name) {
        continue;
      }

      const entryPath = posix.join(folderPath, entry.name);

      if (!entry.id) {
        objectPaths.push(
          ...(await listSupabaseFolderObjectPathsRecursively(
            supabase,
            entryPath
          ))
        );
        continue;
      }

      objectPaths.push(entryPath);
    }

    if (page.length < SUPABASE_STORAGE_LIST_PAGE_SIZE) {
      return objectPaths;
    }

    offset += page.length;
  }
}

async function findSupabaseStorageObject(
  supabase: TypedSupabaseClient,
  fullPath: string
): Promise<StorageObject | null> {
  const folderPath = posix.dirname(fullPath);
  const objectName = posix.basename(fullPath);
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from('workspaces')
      .list(folderPath, {
        limit: SUPABASE_STORAGE_LIST_PAGE_SIZE,
        offset,
        search: objectName,
        sortBy: {
          column: 'name',
          order: 'asc',
        },
      });

    if (error) {
      throw new WorkspaceStorageError(
        error.message || 'Failed to inspect destination object'
      );
    }

    const page = (data ?? []) as StorageObject[];
    const object = page.find((entry) => entry.id && entry.name === objectName);

    if (object) {
      return object;
    }

    if (page.length < SUPABASE_STORAGE_LIST_PAGE_SIZE) {
      return null;
    }

    offset += page.length;
  }
}

async function listSupabaseRawObjectsRecursively(
  supabase: TypedSupabaseClient,
  wsId: string,
  folderPath: string,
  limit?: number
): Promise<WorkspaceStorageRawObject[]> {
  const objects: WorkspaceStorageRawObject[] = [];
  let offset = 0;

  while (true) {
    const remaining = limit ? limit - objects.length : undefined;
    if (remaining !== undefined && remaining <= 0) {
      return objects;
    }

    const { data, error } = await supabase.storage
      .from('workspaces')
      .list(folderPath, {
        limit:
          remaining !== undefined
            ? Math.min(remaining, SUPABASE_STORAGE_LIST_PAGE_SIZE)
            : SUPABASE_STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: {
          column: 'name',
          order: 'asc',
        },
      });

    if (error) {
      throw new WorkspaceStorageError(
        error.message || 'Failed to list Supabase storage objects'
      );
    }

    const page = (data ?? []) as StorageObject[];

    for (const entry of page) {
      if (!entry.name) {
        continue;
      }

      const entryPath = posix.join(folderPath, entry.name);

      if (!entry.id) {
        objects.push(
          ...(await listSupabaseRawObjectsRecursively(
            supabase,
            wsId,
            entryPath,
            remaining
          ))
        );
        if (limit && objects.length >= limit) {
          return objects;
        }
        continue;
      }

      objects.push({
        path: stripWorkspaceStoragePrefix(wsId, entryPath),
        fullPath: entryPath,
        size: toNumber(entry.metadata?.size),
        contentType: getSupabaseStorageObjectContentType(entry),
        updatedAt:
          typeof entry.updated_at === 'string' ? entry.updated_at : null,
        isFolderPlaceholder: entryPath.endsWith(EMPTY_FOLDER_PLACEHOLDER_NAME),
      });

      if (limit && objects.length >= limit) {
        return objects;
      }
    }

    if (page.length < SUPABASE_STORAGE_LIST_PAGE_SIZE) {
      return objects;
    }

    offset += page.length;
  }
}

export async function resolveWorkspaceStorageProvider(
  wsId: string
): Promise<WorkspaceStorageResolvedProvider> {
  const config = await resolveWorkspaceStorageConfig(wsId);
  return {
    provider: config.provider,
    misconfigured: config.misconfigured,
  };
}

export async function resolveWorkspaceStorageBackendConfig(
  wsId: string,
  provider: WorkspaceStorageProvider
): Promise<ResolvedWorkspaceStorageConfig> {
  const secrets = await getSecrets({ wsId, forceAdmin: true });
  return resolveWorkspaceStorageConfigForProvider(
    wsId,
    createSecretsMap(secrets),
    provider
  );
}

export async function listWorkspaceStorageDirectory(
  wsId: string,
  options: WorkspaceStorageListOptions = {}
): Promise<WorkspaceStorageListResult> {
  const config = await resolveWorkspaceStorageConfig(wsId);

  if (config.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
    return listR2Directory(wsId, config, options);
  }

  const supabase = await createDynamicAdminClient();
  const storagePath = buildWorkspaceStorageKey(wsId, options.path);
  const { data, error } = await supabase.storage
    .from('workspaces')
    .list(storagePath, {
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      sortBy: {
        column: options.sortBy ?? 'name',
        order: options.sortOrder ?? 'asc',
      },
      search: options.search?.trim() || undefined,
    });

  if (error) {
    throw new WorkspaceStorageError(error.message || 'Failed to list files');
  }

  const filtered = (data ?? []).filter(
    (entry) => entry.name !== EMPTY_FOLDER_PLACEHOLDER_NAME
  ) as StorageObject[];

  return {
    data: filtered,
    total: await countSupabaseDirectoryEntries(
      supabase,
      storagePath,
      options.search?.trim() || undefined
    ),
    provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  };
}

export async function getWorkspaceStorageOverview(
  wsId: string
): Promise<WorkspaceStorageOverview> {
  const config = await resolveWorkspaceStorageConfig(wsId);
  const supabase = await createDynamicAdminClient();

  if (config.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
    return getR2Overview(wsId, config);
  }

  const { data: totalSize, error: totalSizeError } = await supabase.rpc(
    'get_workspace_drive_size',
    {
      ws_id: wsId,
    }
  );

  if (totalSizeError) {
    console.error('Error fetching total size:', totalSizeError);
  }

  const metrics = await getWorkspaceStorageMetrics(supabase, wsId);

  return {
    provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
    totalSize: totalSize ?? 0,
    fileCount: metrics.fileCount,
    largestFile: metrics.largestFile,
    smallestFile: metrics.smallestFile,
    storageLimit: await getStorageLimit(wsId, supabase),
  };
}

export async function getWorkspaceStorageOverviewForProvider(
  wsId: string,
  provider: WorkspaceStorageProvider
): Promise<WorkspaceStorageOverview> {
  if (provider === WORKSPACE_STORAGE_PROVIDER_SUPABASE) {
    const supabase = await createDynamicAdminClient();
    const { data: totalSize, error: totalSizeError } = await supabase.rpc(
      'get_workspace_drive_size',
      {
        ws_id: wsId,
      }
    );

    if (totalSizeError) {
      console.error('Error fetching total size:', totalSizeError);
    }

    const metrics = await getWorkspaceStorageMetrics(supabase, wsId);

    return {
      provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      totalSize: totalSize ?? 0,
      fileCount: metrics.fileCount,
      largestFile: metrics.largestFile,
      smallestFile: metrics.smallestFile,
      storageLimit: await getStorageLimit(wsId, supabase),
    };
  }

  const config = await resolveWorkspaceStorageBackendConfig(wsId, provider);

  if (config.provider !== WORKSPACE_STORAGE_PROVIDER_R2) {
    throw new WorkspaceStorageError(
      'Cloudflare R2 is not fully configured for this workspace.',
      400
    );
  }

  return getR2Overview(wsId, config);
}

export async function listWorkspaceStorageRawObjectsForProvider(
  wsId: string,
  provider: WorkspaceStorageProvider,
  options: WorkspaceStorageRawListOptions = {}
): Promise<WorkspaceStorageRawObject[]> {
  const sanitizedPrefix = sanitizePath(options.pathPrefix ?? '');
  if (sanitizedPrefix === null) {
    throw new WorkspaceStorageError('Invalid storage prefix.', 400);
  }

  const workspacePrefix = sanitizedPrefix
    ? buildWorkspaceStoragePrefix(wsId, sanitizedPrefix)
    : buildWorkspaceStoragePrefix(wsId);

  if (provider === WORKSPACE_STORAGE_PROVIDER_SUPABASE) {
    const supabase = await createDynamicAdminClient();
    return listSupabaseRawObjectsRecursively(
      supabase as TypedSupabaseClient,
      wsId,
      workspacePrefix.replace(/\/$/, ''),
      options.limit
    );
  }

  const config = await resolveWorkspaceStorageBackendConfig(wsId, provider);

  if (config.provider !== WORKSPACE_STORAGE_PROVIDER_R2) {
    throw new WorkspaceStorageError(
      'Cloudflare R2 is not fully configured for this workspace.',
      400
    );
  }

  const client = createR2Client(config);
  const objects: WorkspaceStorageRawObject[] = [];
  let continuationToken: string | undefined;

  do {
    const remaining = options.limit
      ? options.limit - objects.length
      : undefined;
    if (remaining !== undefined && remaining <= 0) {
      break;
    }

    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: workspacePrefix,
        ContinuationToken: continuationToken,
        MaxKeys:
          remaining !== undefined
            ? Math.min(remaining, SUPABASE_STORAGE_LIST_PAGE_SIZE)
            : undefined,
      })
    );

    for (const item of response.Contents ?? []) {
      const fullPath = item.Key ?? '';
      if (!fullPath) {
        continue;
      }

      objects.push({
        path: stripWorkspaceStoragePrefix(wsId, fullPath),
        fullPath,
        size: item.Size ?? 0,
        updatedAt: item.LastModified?.toISOString() ?? null,
        isFolderPlaceholder: fullPath.endsWith(EMPTY_FOLDER_PLACEHOLDER_NAME),
      });
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

export async function downloadWorkspaceStorageObjectForProvider(
  wsId: string,
  provider: WorkspaceStorageProvider,
  path: string
): Promise<{
  buffer: Uint8Array;
  contentType?: string | null;
}> {
  const fullPath = buildWorkspaceStorageKey(wsId, path);

  if (provider === WORKSPACE_STORAGE_PROVIDER_SUPABASE) {
    const supabase = await createDynamicAdminClient();
    const { data, error } = await supabase.storage
      .from('workspaces')
      .download(fullPath);

    if (error || !data) {
      throw new WorkspaceStorageError(
        error?.message || 'Failed to download source object',
        404
      );
    }

    return {
      buffer: new Uint8Array(await data.arrayBuffer()),
      contentType: data.type || null,
    };
  }

  const config = await resolveWorkspaceStorageBackendConfig(wsId, provider);

  if (config.provider !== WORKSPACE_STORAGE_PROVIDER_R2) {
    throw new WorkspaceStorageError(
      'Cloudflare R2 is not fully configured for this workspace.',
      400
    );
  }

  let response: GetObjectCommandOutput;

  try {
    response = await createR2Client(config).send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: fullPath,
      })
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new WorkspaceStorageError('Failed to download source object', 404);
    }

    throw new WorkspaceStorageError(
      error instanceof Error
        ? error.message
        : 'Failed to download source object'
    );
  }

  if (!response.Body) {
    throw new WorkspaceStorageError('Failed to download source object', 404);
  }

  return {
    buffer: await response.Body.transformToByteArray(),
    contentType: response.ContentType ?? null,
  };
}

export async function uploadWorkspaceStorageFileDirectToProvider(
  wsId: string,
  provider: WorkspaceStorageProvider,
  path: string,
  buffer: Uint8Array,
  options?: {
    contentType?: string;
    upsert?: boolean;
    skipCapacityCheck?: boolean;
  }
) {
  const fullPath = buildWorkspaceStorageKey(wsId, path);

  if (provider === WORKSPACE_STORAGE_PROVIDER_R2) {
    const config = await resolveWorkspaceStorageBackendConfig(wsId, provider);

    if (config.provider !== WORKSPACE_STORAGE_PROVIDER_R2) {
      throw new WorkspaceStorageError(
        'Cloudflare R2 is not fully configured for this workspace.',
        400
      );
    }

    const client = createR2Client(config);

    if (!(options?.upsert ?? false)) {
      const exists = await hasR2Object(client, config.bucket, fullPath);
      if (exists) {
        throw new WorkspaceStorageError(
          'File already exists. Set upsert=true to overwrite.',
          409
        );
      }
    }

    if (!options?.skipCapacityCheck) {
      await ensureWorkspaceCapacity(wsId, buffer.byteLength, {
        provider,
        fullPath,
        upsert: options?.upsert,
      });
    }

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: fullPath,
        Body: buffer,
        ContentType: options?.contentType || 'application/octet-stream',
      })
    );

    return {
      path,
      fullPath,
      provider: WORKSPACE_STORAGE_PROVIDER_R2,
    };
  }

  const supabase = await createDynamicAdminClient();
  if (!(options?.upsert ?? false)) {
    const existingObject = await findSupabaseStorageObject(
      supabase as TypedSupabaseClient,
      fullPath
    );

    if (existingObject) {
      throw new WorkspaceStorageError(
        'File already exists. Set upsert=true to overwrite.',
        409
      );
    }
  }

  if (!options?.skipCapacityCheck) {
    await ensureWorkspaceCapacity(wsId, buffer.byteLength, {
      provider,
      fullPath,
      upsert: options?.upsert,
    });
  }

  const { data, error } = await supabase.storage
    .from('workspaces')
    .upload(fullPath, buffer, {
      contentType: options?.contentType || 'application/octet-stream',
      upsert: options?.upsert ?? false,
    });

  if (error) {
    throw new WorkspaceStorageError(
      error.message || 'Failed to upload file',
      String(error.statusCode) === '409' ? 409 : 500
    );
  }

  const prefix = `${wsId}/`;
  return {
    path: data.path.startsWith(prefix)
      ? data.path.substring(prefix.length)
      : data.path,
    fullPath: data.fullPath ?? fullPath,
    provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  };
}

export async function createWorkspaceStorageSignedReadUrl(
  wsId: string,
  path: string,
  options?: {
    expiresIn?: number;
    provider?: WorkspaceStorageProvider;
    transform?: unknown;
  }
): Promise<string> {
  const config = options?.provider
    ? await resolveWorkspaceStorageBackendConfig(wsId, options.provider)
    : await resolveWorkspaceStorageConfig(wsId);

  if (options?.provider && config.provider !== options.provider) {
    throw new WorkspaceStorageError(
      options.provider === WORKSPACE_STORAGE_PROVIDER_R2
        ? 'Cloudflare R2 is not fully configured for this workspace.'
        : 'Supabase storage is unavailable for this workspace.',
      400
    );
  }

  const fullPath = buildWorkspaceStorageKey(wsId, path);

  if (config.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
    if (options?.transform) {
      throw new WorkspaceStorageError(
        'Image transforms are only supported for Supabase storage.',
        400
      );
    }

    return getSignedUrl(
      createR2Client(config),
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: fullPath,
      }),
      { expiresIn: options?.expiresIn ?? R2_SIGNED_URL_TTL_SECONDS }
    );
  }

  const supabase = await createDynamicAdminClient();
  const { data, error } = await supabase.storage
    .from('workspaces')
    .createSignedUrl(fullPath, options?.expiresIn ?? 31_536_000, {
      transform: options?.transform as never,
    });

  if (error || !data?.signedUrl) {
    throw new WorkspaceStorageError('Failed to generate signed URL');
  }

  return data.signedUrl;
}

export async function createWorkspaceStorageUploadPayload(
  wsId: string,
  filename: string,
  options?: {
    path?: string;
    upsert?: boolean;
    contentType?: string;
    size?: number;
  }
): Promise<WorkspaceStorageUploadPayload> {
  const config = await resolveWorkspaceStorageConfig(wsId);
  const relativePath = normalizeRelativePath(options?.path);
  const sanitizedFilename = normalizeFilename(filename);
  const fullPath = relativePath
    ? posix.join(wsId, relativePath, sanitizedFilename)
    : posix.join(wsId, sanitizedFilename);

  if (config.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
    const client = createR2Client(config);

    if (!(options?.upsert ?? false)) {
      const exists = await hasR2Object(client, config.bucket, fullPath);
      if (exists) {
        throw new WorkspaceStorageError(
          'File already exists. Set upsert=true to overwrite.',
          409
        );
      }
    }

    await ensureWorkspaceCapacity(wsId, options?.size, {
      provider: config.provider,
      fullPath,
      upsert: options?.upsert,
    });

    const signedUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: fullPath,
      }),
      { expiresIn: R2_SIGNED_URL_TTL_SECONDS }
    );

    return {
      signedUrl,
      path: relativePath
        ? posix.join(relativePath, sanitizedFilename)
        : sanitizedFilename,
      fullPath,
    };
  }

  const supabase = await createDynamicAdminClient();

  if (!(options?.upsert ?? false)) {
    const existingObject = await findSupabaseStorageObject(
      supabase as TypedSupabaseClient,
      fullPath
    );

    if (existingObject) {
      throw new WorkspaceStorageError(
        'File already exists. Set upsert=true to overwrite.',
        409
      );
    }
  }

  await ensureWorkspaceCapacity(wsId, options?.size, {
    provider: config.provider,
    fullPath,
    upsert: options?.upsert,
  });
  const { data, error } = await supabase.storage
    .from('workspaces')
    .createSignedUploadUrl(fullPath, {
      upsert: options?.upsert ?? false,
    });

  if (error || !data?.signedUrl || !data.token) {
    throw new WorkspaceStorageError('Failed to generate upload URL');
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: relativePath
      ? posix.join(relativePath, sanitizedFilename)
      : sanitizedFilename,
    fullPath,
  };
}

export async function uploadWorkspaceStorageFileDirect(
  wsId: string,
  path: string,
  buffer: Uint8Array,
  options?: {
    contentType?: string;
    upsert?: boolean;
  }
) {
  const config = await resolveWorkspaceStorageConfig(wsId);
  return uploadWorkspaceStorageFileDirectToProvider(
    wsId,
    config.provider,
    path,
    buffer,
    options
  );
}

export async function createWorkspaceStorageFolderObject(
  wsId: string,
  path: string,
  folderName: string
) {
  const config = await resolveWorkspaceStorageConfig(wsId);
  const relativePath = normalizeRelativePath(path);
  const sanitizedFolderName = normalizeEntryName(folderName);
  const folderPath = relativePath
    ? posix.join(
        wsId,
        relativePath,
        sanitizedFolderName,
        EMPTY_FOLDER_PLACEHOLDER_NAME
      )
    : posix.join(wsId, sanitizedFolderName, EMPTY_FOLDER_PLACEHOLDER_NAME);

  if (config.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
    const client = createR2Client(config);
    const exists = await hasR2Object(client, config.bucket, folderPath);
    if (exists) {
      throw new WorkspaceStorageError('Folder already exists', 409);
    }

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: folderPath,
        Body: '',
        ContentType: 'text/plain',
      })
    );

    return {
      path: relativePath
        ? posix.join(relativePath, sanitizedFolderName)
        : sanitizedFolderName,
      fullPath: folderPath,
      provider: WORKSPACE_STORAGE_PROVIDER_R2,
    };
  }

  const supabase = await createDynamicAdminClient();
  const { data, error } = await supabase.storage
    .from('workspaces')
    .upload(folderPath, new Uint8Array(0), {
      contentType: 'text/plain',
      upsert: false,
    });

  if (error) {
    throw new WorkspaceStorageError(
      /already exists|duplicate/i.test(error.message ?? '')
        ? 'Folder already exists'
        : 'Failed to create folder',
      /already exists|duplicate/i.test(error.message ?? '') ? 409 : 500
    );
  }

  return {
    path: relativePath
      ? posix.join(relativePath, sanitizedFolderName)
      : sanitizedFolderName,
    fullPath: data.path,
    provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  };
}

export async function deleteWorkspaceStorageObjectByPath(
  wsId: string,
  path: string
) {
  const config = await resolveWorkspaceStorageConfig(wsId);
  const fullPath = buildWorkspaceStorageKey(wsId, path);

  if (config.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
    await createR2Client(config).send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: fullPath,
      })
    );

    return {
      provider: WORKSPACE_STORAGE_PROVIDER_R2,
    };
  }

  const supabase = await createDynamicAdminClient();
  const { error } = await supabase.storage
    .from('workspaces')
    .remove([fullPath]);

  if (error) {
    throw new WorkspaceStorageError(
      error.message || 'Failed to delete storage object'
    );
  }

  return {
    provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  };
}

export async function deleteWorkspaceStorageFolderByPath(
  wsId: string,
  path: string,
  folderName: string
) {
  const config = await resolveWorkspaceStorageConfig(wsId);
  const folderPrefix = path
    ? posix.join(
        wsId,
        normalizeRelativePath(path),
        normalizeEntryName(folderName)
      )
    : posix.join(wsId, normalizeEntryName(folderName));

  if (config.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
    const client = createR2Client(config);
    let continuationToken: string | undefined;
    const keys: string[] = [];

    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: `${folderPrefix}/`,
          ContinuationToken: continuationToken,
        })
      );

      keys.push(
        ...(response.Contents ?? []).flatMap((item: { Key?: string }) =>
          item.Key ? [item.Key] : []
        )
      );

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    if (keys.length === 0) {
      throw new WorkspaceStorageError('Folder not found', 404);
    }

    for (let index = 0; index < keys.length; index += 1000) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: {
            Objects: keys
              .slice(index, index + 1000)
              .map((key) => ({ Key: key })),
          },
        })
      );
    }

    return {
      provider: WORKSPACE_STORAGE_PROVIDER_R2,
      deleted: keys.length,
    };
  }

  const supabase = await createDynamicAdminClient();
  const paths = await listSupabaseFolderObjectPathsRecursively(
    supabase as TypedSupabaseClient,
    folderPrefix
  );

  if (paths.length === 0) {
    throw new WorkspaceStorageError('Folder not found', 404);
  }

  for (
    let index = 0;
    index < paths.length;
    index += SUPABASE_STORAGE_LIST_PAGE_SIZE
  ) {
    const { error: removeError } = await supabase.storage
      .from('workspaces')
      .remove(paths.slice(index, index + SUPABASE_STORAGE_LIST_PAGE_SIZE));

    if (removeError) {
      throw new WorkspaceStorageError('Failed to delete folder');
    }
  }

  return {
    provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
    deleted: paths.length,
  };
}

export async function renameWorkspaceStorageEntry(
  wsId: string,
  options: {
    path?: string;
    currentName: string;
    newName: string;
    isFolder?: boolean;
  }
) {
  const config = await resolveWorkspaceStorageConfig(wsId);
  const relativePath = normalizeRelativePath(options.path);
  const currentName = options.isFolder
    ? normalizeEntryName(options.currentName)
    : normalizeFilename(options.currentName);
  const newName = options.isFolder
    ? normalizeEntryName(options.newName)
    : normalizeFilename(options.newName);
  const currentBasePath = relativePath
    ? posix.join(wsId, relativePath, currentName)
    : posix.join(wsId, currentName);
  const nextBasePath = relativePath
    ? posix.join(wsId, relativePath, newName)
    : posix.join(wsId, newName);

  if (config.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
    const client = createR2Client(config);

    if (options.isFolder) {
      let continuationToken: string | undefined;
      const sourceKeys: string[] = [];

      do {
        const source = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: `${currentBasePath}/`,
            ContinuationToken: continuationToken,
          })
        );

        sourceKeys.push(
          ...(source.Contents ?? []).flatMap((item: { Key?: string }) =>
            item.Key ? [item.Key] : []
          )
        );

        continuationToken = source.IsTruncated
          ? source.NextContinuationToken
          : undefined;
      } while (continuationToken);

      if (sourceKeys.length === 0) {
        throw new WorkspaceStorageError('Folder not found', 404);
      }

      const destination = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: `${nextBasePath}/`,
          MaxKeys: 1,
        })
      );

      if ((destination.Contents ?? []).length > 0) {
        throw new WorkspaceStorageError('Folder already exists', 409);
      }

      for (const key of sourceKeys) {
        const destinationKey = key.replace(currentBasePath, nextBasePath);
        await copyR2Object(client, config.bucket, key, destinationKey);
      }

      for (let index = 0; index < sourceKeys.length; index += 1000) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: config.bucket,
            Delete: {
              Objects: sourceKeys
                .slice(index, index + 1000)
                .map((key) => ({ Key: key })),
            },
          })
        );
      }

      return {
        provider: WORKSPACE_STORAGE_PROVIDER_R2,
      };
    }

    const sourceExists = await hasR2Object(
      client,
      config.bucket,
      currentBasePath
    );
    if (!sourceExists) {
      throw new WorkspaceStorageError('File not found', 404);
    }

    const destinationExists = await hasR2Object(
      client,
      config.bucket,
      nextBasePath
    );
    if (destinationExists) {
      throw new WorkspaceStorageError('File already exists', 409);
    }

    await copyR2Object(client, config.bucket, currentBasePath, nextBasePath);
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: currentBasePath,
      })
    );

    return {
      provider: WORKSPACE_STORAGE_PROVIDER_R2,
    };
  }

  const supabase = await createDynamicAdminClient();

  if (options.isFolder) {
    const currentRelativePrefix = relativePath
      ? posix.join(relativePath, currentName)
      : currentName;
    const nextRelativePrefix = relativePath
      ? posix.join(relativePath, newName)
      : newName;
    const existingObjects = await listWorkspaceStorageRawObjectsForProvider(
      wsId,
      WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      {
        pathPrefix: currentRelativePrefix,
      }
    );

    if (existingObjects.length === 0) {
      throw new WorkspaceStorageError('Folder not found', 404);
    }

    const conflictingObjects = await listWorkspaceStorageRawObjectsForProvider(
      wsId,
      WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      {
        pathPrefix: nextRelativePrefix,
        limit: 1,
      }
    );

    if (conflictingObjects.length > 0) {
      throw new WorkspaceStorageError('Folder already exists', 409);
    }

    for (const object of existingObjects) {
      const destination = object.fullPath.replace(
        currentBasePath,
        nextBasePath
      );
      const { error } = await supabase.storage
        .from('workspaces')
        .move(object.fullPath, destination);

      if (error) {
        throw new WorkspaceStorageError(
          /already exists|duplicate/i.test(error.message ?? '')
            ? 'Folder already exists'
            : 'Failed to rename folder',
          /already exists|duplicate/i.test(error.message ?? '') ? 409 : 500
        );
      }
    }

    return {
      provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
    };
  }

  const { error } = await supabase.storage
    .from('workspaces')
    .move(currentBasePath, nextBasePath);

  if (error) {
    throw new WorkspaceStorageError(
      /already exists|duplicate/i.test(error.message ?? '')
        ? 'File already exists'
        : 'Failed to rename file',
      /already exists|duplicate/i.test(error.message ?? '') ? 409 : 500
    );
  }

  return {
    provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  };
}
