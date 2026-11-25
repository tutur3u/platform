import 'server-only';

import {
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  EMPTY_FOLDER_PLACEHOLDER_NAME,
  type StorageObject,
} from '@tuturuuu/types/primitives/StorageObject';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  filterDriveListingEntries,
  isExcludedDriveListingPath,
} from './drive-path-policy';
import { getWorkspaceStorageMetrics } from './storage-analytics';
import { WorkspaceStorageError } from './storage-download-error';
import { downloadGuardedSupabaseStorageObject } from './storage-download-object';
import { createGuardedSupabaseStorageReadUrl } from './storage-download-sign';
import { getStorageLimit } from './storage-quota-reader';
import {
  WORKSPACE_STORAGE_PROVIDER_R2,
  WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  type WorkspaceStorageProvider,
} from './workspace-storage-config';
import {
  buildWorkspaceStorageKey,
  buildWorkspaceStoragePrefix,
  filterReservedWorkspaceStorageObjects,
  normalizeRelativePath,
  stripWorkspaceStoragePrefix,
} from './workspace-storage-keys';
import { toNumber } from './workspace-storage-listing';
import {
  assertWorkspaceStoragePathAllowed,
  type WorkspaceStorageReservedAccessOptions,
} from './workspace-storage-path-access';
import {
  resolveWorkspaceStorageBackendConfig,
  resolveWorkspaceStorageConfig,
} from './workspace-storage-provider-config';
import type {
  WorkspaceStorageListOptions,
  WorkspaceStorageListResult,
  WorkspaceStorageObjectMetadata,
  WorkspaceStorageOverview,
  WorkspaceStorageRawListOptions,
  WorkspaceStorageRawObject,
} from './workspace-storage-provider-types';
import {
  createR2Client,
  createR2SignedUrl,
  getR2Overview,
  hasR2Object,
  isNotFoundError,
  listR2Directory,
  R2_SIGNED_URL_TTL_SECONDS,
} from './workspace-storage-r2-read';
import {
  countSupabaseDirectoryEntries,
  findSupabaseStorageObject,
  getSupabaseStorageObjectContentType,
  listSupabaseRawObjectsRecursively,
  SUPABASE_STORAGE_LIST_PAGE_SIZE,
} from './workspace-storage-supabase';

export async function listWorkspaceStorageDirectory(
  wsId: string,
  options: WorkspaceStorageListOptions = {}
): Promise<WorkspaceStorageListResult> {
  const config = await resolveWorkspaceStorageConfig(wsId);
  const relativePath = normalizeRelativePath(options.path);
  assertWorkspaceStoragePathAllowed(wsId, relativePath, options);
  const { serviceRoot } = options;
  if (isExcludedDriveListingPath(wsId, relativePath, serviceRoot))
    throw new WorkspaceStorageError('Forbidden', 403);

  if (config.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
    const result = await listR2Directory(wsId, config, {
      ...options,
      path: relativePath,
    });
    return relativePath ? result : { ...result, total: result.data.length };
  }

  const supabase = await createDynamicAdminClient();
  const storagePath = buildWorkspaceStorageKey(wsId, relativePath);
  const limit = options.limit ?? 50;
  const { data, error } = await supabase.storage
    .from('workspaces')
    .list(storagePath, {
      limit: limit + 1,
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

  const filtered = filterDriveListingEntries(
    wsId,
    relativePath,
    (data ?? [])
      .slice(0, limit)
      .filter(
        (entry) => entry.name !== EMPTY_FOLDER_PLACEHOLDER_NAME
      ) as StorageObject[],
    serviceRoot
  );

  return {
    data: filtered,
    hasMore: (data?.length ?? 0) > limit,
    total: relativePath
      ? await countSupabaseDirectoryEntries(supabase, storagePath, {
          search: options.search?.trim() || undefined,
          serviceRoot,
        })
      : filtered.length,
    provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  };
}

export async function getWorkspaceStorageOverview(
  wsId: string,
  includeReservedForQuota = false
): Promise<WorkspaceStorageOverview> {
  const config = await resolveWorkspaceStorageConfig(wsId);
  const supabase = await createDynamicAdminClient();

  if (config.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
    return getR2Overview(wsId, config, includeReservedForQuota);
  }

  const metrics = await getWorkspaceStorageMetrics(
    supabase,
    wsId,
    includeReservedForQuota
  );

  return {
    provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
    totalSize: metrics.totalSize,
    fileCount: metrics.fileCount,
    largestFile: metrics.largestFile,
    smallestFile: metrics.smallestFile,
    storageLimit: await getStorageLimit(wsId, supabase),
  };
}

export async function getWorkspaceStorageOverviewForProvider(
  wsId: string,
  provider: WorkspaceStorageProvider,
  includeReservedForQuota = false
): Promise<WorkspaceStorageOverview> {
  if (provider === WORKSPACE_STORAGE_PROVIDER_SUPABASE) {
    const supabase = await createDynamicAdminClient();
    const metrics = await getWorkspaceStorageMetrics(
      supabase,
      wsId,
      includeReservedForQuota
    );

    return {
      provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      totalSize: metrics.totalSize,
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

  return getR2Overview(wsId, config, includeReservedForQuota);
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
  if (sanitizedPrefix) {
    assertWorkspaceStoragePathAllowed(wsId, sanitizedPrefix, options);
  }

  const workspacePrefix = sanitizedPrefix
    ? buildWorkspaceStoragePrefix(wsId, sanitizedPrefix)
    : buildWorkspaceStoragePrefix(wsId);

  if (provider === WORKSPACE_STORAGE_PROVIDER_SUPABASE) {
    const supabase = await createDynamicAdminClient();
    return filterReservedWorkspaceStorageObjects(
      wsId,
      await listSupabaseRawObjectsRecursively(
        supabase as TypedSupabaseClient,
        wsId,
        workspacePrefix.replace(/\/$/, ''),
        options.limit
      ),
      options
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

  return filterReservedWorkspaceStorageObjects(wsId, objects, options);
}

export async function getWorkspaceStorageObjectMetadataForProvider(
  wsId: string,
  provider: WorkspaceStorageProvider,
  path: string,
  options?: WorkspaceStorageReservedAccessOptions
): Promise<WorkspaceStorageObjectMetadata> {
  const relativePath = normalizeRelativePath(path);
  assertWorkspaceStoragePathAllowed(wsId, relativePath, options);
  const fullPath = buildWorkspaceStorageKey(wsId, relativePath);

  if (provider === WORKSPACE_STORAGE_PROVIDER_SUPABASE) {
    const supabase = await createDynamicAdminClient();
    const object = await findSupabaseStorageObject(
      supabase as TypedSupabaseClient,
      fullPath
    );

    if (!object) {
      throw new WorkspaceStorageError('Storage object not found', 404);
    }

    return {
      provider,
      path: relativePath,
      fullPath,
      size: toNumber(object.metadata?.size),
      contentType: getSupabaseStorageObjectContentType(object),
      updatedAt:
        typeof object.updated_at === 'string' ? object.updated_at : null,
    };
  }

  const config = await resolveWorkspaceStorageBackendConfig(wsId, provider);

  if (config.provider !== WORKSPACE_STORAGE_PROVIDER_R2) {
    throw new WorkspaceStorageError(
      'Cloudflare R2 is not fully configured for this workspace.',
      400
    );
  }

  try {
    const response = await createR2Client(config).send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: fullPath,
      })
    );

    return {
      provider,
      path: relativePath,
      fullPath,
      size: Number(response.ContentLength ?? 0),
      contentType: response.ContentType ?? null,
      updatedAt: response.LastModified?.toISOString() ?? null,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new WorkspaceStorageError('Storage object not found', 404);
    }

    throw new WorkspaceStorageError(
      error instanceof Error
        ? error.message
        : 'Failed to inspect storage object'
    );
  }
}

export async function downloadWorkspaceStorageObjectForProvider(
  wsId: string,
  provider: WorkspaceStorageProvider,
  path: string,
  options?: WorkspaceStorageReservedAccessOptions
): Promise<{
  buffer: Uint8Array;
  contentType?: string | null;
}> {
  const relativePath = normalizeRelativePath(path);
  assertWorkspaceStoragePathAllowed(wsId, relativePath, options);
  const fullPath = buildWorkspaceStorageKey(wsId, relativePath);

  if (provider === WORKSPACE_STORAGE_PROVIDER_SUPABASE) {
    const supabase = await createDynamicAdminClient();
    return downloadGuardedSupabaseStorageObject(supabase, wsId, fullPath);
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

export async function createWorkspaceStorageSignedReadUrl(
  wsId: string,
  path: string,
  options?: {
    allowReservedMobileDeploymentVault?: boolean;
    expiresIn?: number;
    provider?: WorkspaceStorageProvider;
    requireExists?: boolean;
    transform?: unknown;
  }
): Promise<string> {
  const relativePath = normalizeRelativePath(path);
  assertWorkspaceStoragePathAllowed(wsId, relativePath, options);
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

  const fullPath = buildWorkspaceStorageKey(wsId, relativePath);

  if (config.provider === WORKSPACE_STORAGE_PROVIDER_R2) {
    if (options?.transform) {
      throw new WorkspaceStorageError(
        'Image transforms are only supported for Supabase storage.',
        400
      );
    }

    const client = createR2Client(config);

    if (options?.requireExists) {
      const exists = await hasR2Object(client, config.bucket, fullPath);

      if (!exists) {
        throw new WorkspaceStorageError('Storage object not found', 404);
      }
    }

    return createR2SignedUrl(
      client,
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: fullPath,
      }),
      { expiresIn: options?.expiresIn ?? R2_SIGNED_URL_TTL_SECONDS }
    );
  }

  const supabase = await createDynamicAdminClient();
  if (options?.requireExists) {
    const object = await findSupabaseStorageObject(
      supabase as TypedSupabaseClient,
      fullPath
    );

    if (!object) {
      throw new WorkspaceStorageError('Storage object not found', 404);
    }
  }

  return createGuardedSupabaseStorageReadUrl(
    supabase as TypedSupabaseClient,
    wsId,
    fullPath,
    options?.expiresIn ?? 3600,
    options?.transform
  );
}
