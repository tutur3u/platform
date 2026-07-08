import { posix } from 'node:path';
import {
  createWorkspaceStorageFolderObject,
  createWorkspaceStorageSignedReadUrl,
  deleteWorkspaceStorageFolderByPath,
  deleteWorkspaceStorageObjectByPath,
  listWorkspaceStorageDirectory,
  renameWorkspaceStorageEntry,
  uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { validateWorkspaceStorageUploadMetadata } from '@tuturuuu/storage-core/workspace-storage-upload-policy';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import {
  sanitizeFilename,
  sanitizeFolderName,
  sanitizePath,
} from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';

const SIGNED_READ_URL_TTL_SECONDS = 900;

type ExternalProjectAccess = Extract<
  Awaited<ReturnType<typeof requireWorkspaceExternalProjectAccess>>,
  { ok: true }
>;

type ExternalProjectAssetPathRow = {
  id: string;
  storage_path: string | null;
};

const storageListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  path: z.string().max(1024).default(''),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['name', 'created_at', 'updated_at', 'size']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  path: z.string().max(1024).default(''),
});

const storageEntryKindSchema = z.enum(['file', 'folder']);

const renameEntrySchema = z.object({
  kind: storageEntryKindSchema.default('file'),
  newName: z.string().min(1).max(255),
  path: z.string().min(1).max(1024),
});

const deleteEntrySchema = z.object({
  kind: storageEntryKindSchema.default('file'),
  path: z.string().min(1).max(1024),
});

function getExternalProjectStoragePrefix(access: ExternalProjectAccess) {
  return posix.join('external-projects', access.binding.adapter ?? 'shared');
}

function toScopedPath(prefix: string, relativePath = '') {
  return relativePath ? posix.join(prefix, relativePath) : prefix;
}

function toRelativePath(prefix: string, scopedPath: string) {
  if (scopedPath === prefix) {
    return '';
  }

  const prefixWithSlash = `${prefix}/`;
  return scopedPath.startsWith(prefixWithSlash)
    ? scopedPath.slice(prefixWithSlash.length)
    : scopedPath;
}

function sanitizeRelativePath(path: string) {
  return sanitizePath(path);
}

function splitRelativeEntryPath(path: string) {
  const sanitizedPath = sanitizeRelativePath(path);

  if (!sanitizedPath) {
    return null;
  }

  const name = posix.basename(sanitizedPath);
  const parentPath = posix.dirname(sanitizedPath);

  if (!name || name === '.' || name === '..') {
    return null;
  }

  return {
    name,
    parentPath: parentPath === '.' ? '' : parentPath,
    path: sanitizedPath,
  };
}

function sanitizeEntryName(
  name: string,
  kind: z.infer<typeof storageEntryKindSchema>
) {
  return kind === 'folder' ? sanitizeFolderName(name) : sanitizeFilename(name);
}

function getStorageObjectSize(entry: StorageObject) {
  const size = entry.metadata?.size;
  return typeof size === 'number' && Number.isFinite(size) ? size : 0;
}

function getStorageObjectContentType(entry: StorageObject) {
  const metadata = entry.metadata ?? {};
  const contentType =
    metadata.mimetype ??
    metadata.mimeType ??
    metadata.mediaType ??
    metadata.contentType;

  return typeof contentType === 'string' ? contentType : null;
}

function mapStorageObject({
  currentPath,
  entry,
}: {
  currentPath: string;
  entry: StorageObject;
}) {
  const name = entry.name ?? '';
  const path = currentPath ? posix.join(currentPath, name) : name;
  const kind = entry.id ? 'file' : 'folder';

  return {
    contentType: kind === 'file' ? getStorageObjectContentType(entry) : null,
    createdAt: entry.created_at ?? null,
    kind,
    name,
    path,
    size: kind === 'file' ? getStorageObjectSize(entry) : 0,
    updatedAt: entry.updated_at ?? null,
  };
}

function errorJson(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getExternalProjectStorageAssetPathFilter({
  kind,
  prefix,
  relativePath,
}: {
  kind: z.infer<typeof storageEntryKindSchema>;
  prefix: string;
  relativePath: string;
}) {
  const scopedPath = toScopedPath(prefix, relativePath);
  const scopedFolderPath = `${scopedPath}/`;

  return (asset: ExternalProjectAssetPathRow) => {
    const storagePath = asset.storage_path;
    if (!storagePath) {
      return false;
    }

    return kind === 'folder'
      ? storagePath === scopedPath || storagePath.startsWith(scopedFolderPath)
      : storagePath === scopedPath;
  };
}

async function getExternalProjectStorageAssetRows({
  access,
  kind,
  prefix,
  relativePath,
}: {
  access: ExternalProjectAccess;
  kind: z.infer<typeof storageEntryKindSchema>;
  prefix: string;
  relativePath: string;
}) {
  if (kind === 'file') {
    const { data, error } = await access.admin
      .from('workspace_external_project_assets')
      .select('id, storage_path')
      .eq('ws_id', access.normalizedWorkspaceId)
      .eq('storage_path', toScopedPath(prefix, relativePath));

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as ExternalProjectAssetPathRow[];
  }

  const { data, error } = await access.admin
    .from('workspace_external_project_assets')
    .select('id, storage_path')
    .eq('ws_id', access.normalizedWorkspaceId)
    .like('storage_path', `${prefix}/%`);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as ExternalProjectAssetPathRow[]).filter(
    getExternalProjectStorageAssetPathFilter({ kind, prefix, relativePath })
  );
}

async function detachExternalProjectStorageAssets({
  access,
  kind,
  prefix,
  relativePath,
}: {
  access: ExternalProjectAccess;
  kind: z.infer<typeof storageEntryKindSchema>;
  prefix: string;
  relativePath: string;
}) {
  const assets = await getExternalProjectStorageAssetRows({
    access,
    kind,
    prefix,
    relativePath,
  });

  if (assets.length === 0) {
    return 0;
  }

  const { error } = await access.admin
    .from('workspace_external_project_assets')
    .delete()
    .eq('ws_id', access.normalizedWorkspaceId)
    .in(
      'id',
      assets.map((asset) => asset.id)
    );

  if (error) {
    throw new Error(error.message);
  }

  return assets.length;
}

async function updateExternalProjectStorageAssetPaths({
  access,
  kind,
  nextRelativePath,
  prefix,
  previousRelativePath,
}: {
  access: ExternalProjectAccess;
  kind: z.infer<typeof storageEntryKindSchema>;
  nextRelativePath: string;
  prefix: string;
  previousRelativePath: string;
}) {
  const assets = await getExternalProjectStorageAssetRows({
    access,
    kind,
    prefix,
    relativePath: previousRelativePath,
  });

  if (assets.length === 0) {
    return 0;
  }

  const previousScopedPath = toScopedPath(prefix, previousRelativePath);
  const nextScopedPath = toScopedPath(prefix, nextRelativePath);

  for (const asset of assets) {
    if (!asset.storage_path) {
      continue;
    }

    const nextStoragePath =
      kind === 'folder'
        ? asset.storage_path.replace(previousScopedPath, nextScopedPath)
        : nextScopedPath;

    const { error } = await access.admin
      .from('workspace_external_project_assets')
      .update({
        storage_path: nextStoragePath,
        updated_by: access.user.id,
      })
      .eq('ws_id', access.normalizedWorkspaceId)
      .eq('id', asset.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  return assets.length;
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handleUpload({
  access,
  prefix,
  request,
}: {
  access: ExternalProjectAccess;
  prefix: string;
  request: Request;
}) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorJson('Invalid upload body', 400);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return errorJson('Missing file', 400);
  }

  const sanitizedFilename = sanitizeFilename(file.name);
  if (!sanitizedFilename) {
    return errorJson('Invalid filename', 400);
  }

  const uploadValidation = validateWorkspaceStorageUploadMetadata({
    allowExternalProjectAssets: true,
    contentType: file.type,
    filename: sanitizedFilename,
    size: file.size,
  });

  if (!uploadValidation.ok) {
    return errorJson(uploadValidation.message, uploadValidation.status);
  }

  const sanitizedPath = sanitizeRelativePath(
    String(formData.get('path') || '')
  );
  if (sanitizedPath === null) {
    return errorJson('Invalid path', 400);
  }

  const scopedPath = toScopedPath(prefix, sanitizedPath);
  const storagePath = posix.join(scopedPath, sanitizedFilename);
  const buffer = new Uint8Array(await file.arrayBuffer());
  const data = await uploadWorkspaceStorageFileDirect(
    access.normalizedWorkspaceId,
    storagePath,
    buffer,
    {
      contentType: uploadValidation.contentType || 'application/octet-stream',
      upsert: formData.get('upsert') === 'true',
    }
  );

  return NextResponse.json({
    data: {
      fullPath: data.fullPath,
      name: sanitizedFilename,
      path: toRelativePath(prefix, data.path),
      provider: data.provider,
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'read',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  const prefix = getExternalProjectStoragePrefix(access);
  const url = new URL(request.url);
  const filePath = url.searchParams.get('filePath');

  try {
    if (filePath !== null) {
      const sanitizedFilePath = sanitizeRelativePath(filePath);
      if (!sanitizedFilePath) {
        return errorJson('Invalid file path', 400);
      }

      const signedUrl = await createWorkspaceStorageSignedReadUrl(
        access.normalizedWorkspaceId,
        toScopedPath(prefix, sanitizedFilePath),
        {
          expiresIn: SIGNED_READ_URL_TTL_SECONDS,
          requireExists: true,
        }
      );

      return NextResponse.json({
        data: {
          expiresIn: SIGNED_READ_URL_TTL_SECONDS,
          signedUrl,
        },
      });
    }

    const parsed = storageListSchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
      path: url.searchParams.get('path') ?? '',
      search: url.searchParams.get('search') ?? undefined,
      sortBy: url.searchParams.get('sortBy') ?? undefined,
      sortOrder: url.searchParams.get('sortOrder') ?? undefined,
    });

    if (!parsed.success) {
      return errorJson('Invalid storage query', 400);
    }

    const sanitizedPath = sanitizeRelativePath(parsed.data.path);
    if (sanitizedPath === null) {
      return errorJson('Invalid path', 400);
    }

    const result = await listWorkspaceStorageDirectory(
      access.normalizedWorkspaceId,
      {
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        path: toScopedPath(prefix, sanitizedPath),
        search: parsed.data.search,
        sortBy: parsed.data.sortBy,
        sortOrder: parsed.data.sortOrder,
      }
    );

    return NextResponse.json({
      data: {
        items: result.data.map((entry) =>
          mapStorageObject({ currentPath: sanitizedPath, entry })
        ),
        path: sanitizedPath,
        provider: result.provider,
        total: result.total,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return errorJson(error.message, error.status);
    }

    console.error('Failed to read external project storage', { error });
    return errorJson('Failed to read external project storage', 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  const prefix = getExternalProjectStoragePrefix(access);

  try {
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      return await handleUpload({ access, prefix, request });
    }

    const parsed = createFolderSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) {
      return errorJson('Invalid folder body', 400);
    }

    const sanitizedPath = sanitizeRelativePath(parsed.data.path);
    if (sanitizedPath === null) {
      return errorJson('Invalid path', 400);
    }

    const sanitizedName = sanitizeFolderName(parsed.data.name);
    if (!sanitizedName) {
      return errorJson('Invalid folder name', 400);
    }

    const data = await createWorkspaceStorageFolderObject(
      access.normalizedWorkspaceId,
      toScopedPath(prefix, sanitizedPath),
      sanitizedName
    );

    return NextResponse.json({
      data: {
        fullPath: data.fullPath,
        name: sanitizedName,
        path: toRelativePath(prefix, data.path),
        provider: data.provider,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return errorJson(error.message, error.status);
    }

    console.error('Failed to change external project storage', { error });
    return errorJson('Failed to change external project storage', 500);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  const parsed = renameEntrySchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return errorJson('Invalid rename body', 400);
  }

  const entry = splitRelativeEntryPath(parsed.data.path);
  if (!entry) {
    return errorJson('Invalid entry path', 400);
  }

  const newName = sanitizeEntryName(parsed.data.newName, parsed.data.kind);
  if (!newName) {
    return errorJson('Invalid entry name', 400);
  }

  if (entry.name === newName) {
    return NextResponse.json({
      data: {
        name: newName,
        path: entry.path,
        previousPath: entry.path,
      },
    });
  }

  const prefix = getExternalProjectStoragePrefix(access);
  const parentPath = toScopedPath(prefix, entry.parentPath);

  try {
    await renameWorkspaceStorageEntry(access.normalizedWorkspaceId, {
      currentName: entry.name,
      isFolder: parsed.data.kind === 'folder',
      newName,
      path: parentPath,
    });

    const nextPath = toRelativePath(prefix, posix.join(parentPath, newName));
    const updatedAssets = await updateExternalProjectStorageAssetPaths({
      access,
      kind: parsed.data.kind,
      nextRelativePath: nextPath,
      prefix,
      previousRelativePath: entry.path,
    });

    return NextResponse.json({
      data: {
        name: newName,
        path: nextPath,
        previousPath: entry.path,
        updatedAssets,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return errorJson(error.message, error.status);
    }

    console.error('Failed to rename external project storage entry', {
      error,
    });
    return errorJson('Failed to rename external project storage entry', 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  const parsed = deleteEntrySchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return errorJson('Invalid delete body', 400);
  }

  const entry = splitRelativeEntryPath(parsed.data.path);
  if (!entry) {
    return errorJson('Invalid entry path', 400);
  }

  const prefix = getExternalProjectStoragePrefix(access);
  const parentPath = toScopedPath(prefix, entry.parentPath);

  try {
    if (parsed.data.kind === 'folder') {
      await deleteWorkspaceStorageFolderByPath(
        access.normalizedWorkspaceId,
        parentPath,
        entry.name
      );
    } else {
      await deleteWorkspaceStorageObjectByPath(
        access.normalizedWorkspaceId,
        toScopedPath(prefix, entry.path)
      );
    }

    const detachedAssets = await detachExternalProjectStorageAssets({
      access,
      kind: parsed.data.kind,
      prefix,
      relativePath: entry.path,
    });

    return NextResponse.json({
      data: {
        detachedAssets,
        path: entry.path,
        success: true,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return errorJson(error.message, error.status);
    }

    console.error('Failed to delete external project storage entry', {
      error,
    });
    return errorJson('Failed to delete external project storage entry', 500);
  }
}
