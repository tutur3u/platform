import 'server-only';

import { posix } from 'node:path';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { encodeStoragePath } from '@tuturuuu/utils/storage-path';
import { WorkspaceStorageError } from './storage-download-error';
import { fitsStorageBudget } from './storage-quota';
import { assertStorageUploadSize } from './storage-upload-capacity';
import {
  WORKSPACE_STORAGE_PROVIDER_R2,
  WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  type WorkspaceStorageProvider,
} from './workspace-storage-config';
import {
  buildWorkspaceStorageKey,
  normalizeFilename,
  normalizeRelativePath,
} from './workspace-storage-keys';
import { toNumber } from './workspace-storage-listing';
import { assertWorkspaceStoragePathAllowed } from './workspace-storage-path-access';
import {
  resolveWorkspaceStorageBackendConfig,
  resolveWorkspaceStorageConfig,
} from './workspace-storage-provider-config';
import type { WorkspaceStorageUploadPayload } from './workspace-storage-provider-types';
import {
  createR2Client,
  createR2SignedUrl,
  hasR2Object,
  isNotFoundError,
  R2_SIGNED_URL_TTL_SECONDS,
} from './workspace-storage-r2-read';
import {
  getWorkspaceStorageOverview,
  getWorkspaceStorageOverviewForProvider,
} from './workspace-storage-read';
import { findSupabaseStorageObject } from './workspace-storage-supabase';

export async function ensureWorkspaceCapacity(
  wsId: string,
  incomingBytes?: number,
  options?: {
    provider?: WorkspaceStorageProvider;
    allowEmpty?: boolean;
    fullPath?: string;
    upsert?: boolean;
  }
): Promise<void> {
  assertStorageUploadSize(incomingBytes, options?.allowEmpty);
  const overview = options?.provider
    ? await getWorkspaceStorageOverviewForProvider(wsId, options.provider, true)
    : await getWorkspaceStorageOverview(wsId, true);
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
    !fitsStorageBudget(
      overview.totalSize,
      incomingBytes,
      overview.storageLimit,
      existingBytes,
      options?.allowEmpty
    )
  ) {
    throw new WorkspaceStorageError(
      'Workspace storage limit exceeded. Please free up space or upgrade your plan.',
      413
    );
  }
}

export async function uploadWorkspaceStorageFileDirectToProvider(
  wsId: string,
  provider: WorkspaceStorageProvider,
  path: string,
  buffer: Uint8Array,
  options?: {
    allowEmpty?: boolean;
    allowReservedMobileDeploymentVault?: boolean;
    contentType?: string;
    upsert?: boolean;
    skipCapacityCheck?: boolean;
  }
) {
  const relativePath = normalizeRelativePath(path);
  assertWorkspaceStoragePathAllowed(wsId, relativePath, options);
  const fullPath = buildWorkspaceStorageKey(wsId, relativePath);

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
        allowEmpty: options?.allowEmpty,
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
      path: relativePath,
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
      allowEmpty: options?.allowEmpty,
      fullPath,
      upsert: options?.upsert,
    });
  }

  const { data, error } = await supabase.storage
    .from('workspaces')
    .upload(encodeStoragePath(fullPath), buffer, {
      contentType: options?.contentType || 'application/octet-stream',
      upsert: options?.upsert ?? false,
    });

  if (error) {
    throw new WorkspaceStorageError(
      error.message || 'Failed to upload file',
      String(error.statusCode) === '409' ? 409 : 500
    );
  }

  // storage-js echoes the encoded transport key; return the logical key so it
  // round-trips through the download and signing helpers unchanged.
  return {
    path: relativePath,
    fullPath: data.fullPath ? `workspaces/${fullPath}` : fullPath,
    provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  };
}

export async function createWorkspaceStorageUploadPayload(
  wsId: string,
  filename: string,
  options?: {
    allowReservedMobileDeploymentVault?: boolean;
    path?: string;
    upsert?: boolean;
    contentType?: string;
    size?: number;
  }
): Promise<WorkspaceStorageUploadPayload> {
  const config = await resolveWorkspaceStorageConfig(wsId);
  const relativePath = normalizeRelativePath(options?.path);
  const sanitizedFilename = normalizeFilename(filename);
  const storagePath = relativePath
    ? posix.join(relativePath, sanitizedFilename)
    : sanitizedFilename;
  assertWorkspaceStoragePathAllowed(wsId, storagePath, options);
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

    const signedUrl = await createR2SignedUrl(
      client,
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: fullPath,
        ContentLength: options?.size,
        ContentType: options?.contentType,
      }),
      { expiresIn: R2_SIGNED_URL_TTL_SECONDS }
    );

    return {
      signedUrl,
      path: storagePath,
      fullPath,
      filename: sanitizedFilename,
      contentType: options?.contentType,
      headers: options?.contentType
        ? {
            'Content-Type': options.contentType,
          }
        : undefined,
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

  await ensureWorkspaceCapacity(wsId, options?.size, {
    provider: config.provider,
    fullPath,
    upsert: options?.upsert,
  });
  const { data, error } = await supabase.storage
    .from('workspaces')
    .createSignedUploadUrl(encodeStoragePath(fullPath), {
      upsert: options?.upsert ?? false,
    });

  if (error || !data?.signedUrl || !data.token) {
    throw new WorkspaceStorageError('Failed to generate upload URL');
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: storagePath,
    fullPath,
    filename: sanitizedFilename,
    contentType: options?.contentType,
    headers: options?.contentType
      ? {
          'Content-Type': options.contentType,
        }
      : undefined,
    provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  };
}

export async function uploadWorkspaceStorageFileDirect(
  wsId: string,
  path: string,
  buffer: Uint8Array,
  options?: {
    allowEmpty?: boolean;
    allowReservedMobileDeploymentVault?: boolean;
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
