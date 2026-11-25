import 'server-only';

import { posix } from 'node:path';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { EMPTY_FOLDER_PLACEHOLDER_NAME } from '@tuturuuu/types/primitives/StorageObject';
import { encodeStoragePath } from '@tuturuuu/utils/storage-path';
import { WorkspaceStorageError } from './storage-download-error';
import {
  WORKSPACE_STORAGE_PROVIDER_R2,
  WORKSPACE_STORAGE_PROVIDER_SUPABASE,
} from './workspace-storage-config';
import {
  buildWorkspaceStorageKey,
  normalizeEntryName,
  normalizeFilename,
  normalizeRelativePath,
} from './workspace-storage-keys';
import {
  assertWorkspaceStorageMutationPathsAllowed,
  assertWorkspaceStoragePathAllowed,
  type WorkspaceStorageReservedAccessOptions,
} from './workspace-storage-path-access';
import { resolveWorkspaceStorageConfig } from './workspace-storage-provider-config';
import {
  copyR2Object,
  createR2Client,
  hasR2Object,
} from './workspace-storage-r2-read';
import { listWorkspaceStorageRawObjectsForProvider } from './workspace-storage-read';
import {
  listSupabaseFolderObjectPathsRecursively,
  SUPABASE_STORAGE_LIST_PAGE_SIZE,
} from './workspace-storage-supabase';

export async function createWorkspaceStorageFolderObject(
  wsId: string,
  path: string,
  folderName: string,
  options?: WorkspaceStorageReservedAccessOptions
) {
  const config = await resolveWorkspaceStorageConfig(wsId);
  const relativePath = normalizeRelativePath(path);
  const sanitizedFolderName = normalizeEntryName(folderName);
  const relativeFolderPath = relativePath
    ? posix.join(relativePath, sanitizedFolderName)
    : sanitizedFolderName;
  assertWorkspaceStoragePathAllowed(wsId, relativeFolderPath, options);
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
      path: relativeFolderPath,
      fullPath: folderPath,
      provider: WORKSPACE_STORAGE_PROVIDER_R2,
    };
  }

  const supabase = await createDynamicAdminClient();
  const { error } = await supabase.storage
    .from('workspaces')
    .upload(encodeStoragePath(folderPath), new Uint8Array(0), {
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
    path: relativeFolderPath,
    fullPath: folderPath,
    provider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  };
}

export async function deleteWorkspaceStorageObjectByPath(
  wsId: string,
  path: string,
  options?: WorkspaceStorageReservedAccessOptions
) {
  const config = await resolveWorkspaceStorageConfig(wsId);
  const relativePath = normalizeRelativePath(path);
  assertWorkspaceStoragePathAllowed(wsId, relativePath, options);
  const fullPath = buildWorkspaceStorageKey(wsId, relativePath);

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
  folderName: string,
  options?: WorkspaceStorageReservedAccessOptions
) {
  const config = await resolveWorkspaceStorageConfig(wsId);
  const relativePath = normalizeRelativePath(path);
  const sanitizedFolderName = normalizeEntryName(folderName);
  const relativeFolderPath = relativePath
    ? posix.join(relativePath, sanitizedFolderName)
    : sanitizedFolderName;
  assertWorkspaceStoragePathAllowed(wsId, relativeFolderPath, options);
  const folderPrefix = relativePath
    ? posix.join(wsId, relativePath, sanitizedFolderName)
    : posix.join(wsId, sanitizedFolderName);

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

    assertWorkspaceStorageMutationPathsAllowed(wsId, keys, options);
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

  assertWorkspaceStorageMutationPathsAllowed(wsId, paths, options);
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
  options: WorkspaceStorageReservedAccessOptions & {
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
  const currentRelativePath = relativePath
    ? posix.join(relativePath, currentName)
    : currentName;
  const nextRelativePath = relativePath
    ? posix.join(relativePath, newName)
    : newName;
  assertWorkspaceStoragePathAllowed(wsId, currentRelativePath, options);
  assertWorkspaceStoragePathAllowed(wsId, nextRelativePath, options);
  const currentBasePath = buildWorkspaceStorageKey(wsId, currentRelativePath);
  const nextBasePath = buildWorkspaceStorageKey(wsId, nextRelativePath);

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

      assertWorkspaceStorageMutationPathsAllowed(wsId, sourceKeys, options, {
        from: currentBasePath,
        to: nextBasePath,
      });
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
    const existingObjects = await listWorkspaceStorageRawObjectsForProvider(
      wsId,
      WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      {
        pathPrefix: currentRelativePath,
      }
    );

    assertWorkspaceStorageMutationPathsAllowed(
      wsId,
      existingObjects.map((object) => object.fullPath),
      options,
      { from: currentBasePath, to: nextBasePath }
    );
    if (existingObjects.length === 0) {
      throw new WorkspaceStorageError('Folder not found', 404);
    }

    const conflictingObjects = await listWorkspaceStorageRawObjectsForProvider(
      wsId,
      WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      {
        pathPrefix: nextRelativePath,
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
