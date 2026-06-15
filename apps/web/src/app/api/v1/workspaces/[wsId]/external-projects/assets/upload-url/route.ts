import { posix } from 'node:path';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { WORKSPACE_STORAGE_PROVIDER_SUPABASE } from '@/lib/workspace-storage-config';
import {
  createWorkspaceStorageUploadPayload,
  resolveWorkspaceStorageProvider,
  uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import { validateWorkspaceStorageUploadMetadata } from '@/lib/workspace-storage-upload-policy';

const uploadUrlSchema = z.object({
  collectionType: z.string().min(1).max(120),
  contentType: z.string().min(1).max(255).optional(),
  entrySlug: z.string().min(1).max(120),
  filename: z.string().min(1).max(255),
  size: z.number().int().finite().optional(),
  upsert: z.boolean().optional(),
});

type ExternalProjectUploadAccess = Extract<
  Awaited<ReturnType<typeof requireWorkspaceExternalProjectAccess>>,
  { ok: true }
>;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function getFormBoolean(formData: FormData, key: string) {
  return getFormString(formData, key).toLowerCase() === 'true';
}

function buildExternalProjectAssetUploadTarget({
  access,
  collectionType,
  contentType,
  entrySlug,
  filename,
  size,
  upsert,
}: {
  access: ExternalProjectUploadAccess;
  collectionType: string;
  contentType?: string;
  entrySlug: string;
  filename: string;
  size?: number;
  upsert: boolean;
}) {
  const sanitizedCollectionType = sanitizePath(collectionType);
  const sanitizedEntrySlug = sanitizePath(entrySlug);
  const sanitizedFilename = sanitizeFilename(filename);

  if (!sanitizedCollectionType || !sanitizedEntrySlug || !sanitizedFilename) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Invalid upload path' },
        { status: 400 }
      ),
    };
  }

  const uploadValidation = validateWorkspaceStorageUploadMetadata({
    allowExternalProjectAssets: true,
    contentType,
    filename: sanitizedFilename,
    size,
  });
  if (!uploadValidation.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: uploadValidation.message },
        { status: uploadValidation.status }
      ),
    };
  }

  const filenameWithSuffix = upsert
    ? sanitizedFilename
    : `${generateRandomUUID()}-${sanitizedFilename}`;
  const storageDirectory = posix.join(
    'external-projects',
    access.binding.adapter ?? 'shared',
    sanitizedCollectionType,
    sanitizedEntrySlug
  );

  return {
    ok: true as const,
    contentType: uploadValidation.contentType,
    filename: filenameWithSuffix,
    storageDirectory,
    storagePath: posix.join(storageDirectory, filenameWithSuffix),
    upsert,
  };
}

async function uploadExternalProjectAssetDirect(
  request: Request,
  access: ExternalProjectUploadAccess
) {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A file is required' }, { status: 400 });
  }

  const target = buildExternalProjectAssetUploadTarget({
    access,
    collectionType: getFormString(formData, 'collectionType'),
    contentType: file.type || getFormString(formData, 'contentType'),
    entrySlug: getFormString(formData, 'entrySlug'),
    filename: file.name,
    size: file.size,
    upsert: getFormBoolean(formData, 'upsert'),
  });

  if (!target.ok) return target.response;

  const uploaded = await uploadWorkspaceStorageFileDirect(
    access.normalizedWorkspaceId,
    target.storagePath,
    new Uint8Array(await file.arrayBuffer()),
    {
      contentType: target.contentType,
      upsert: target.upsert,
    }
  );

  return NextResponse.json({
    contentType: target.contentType,
    filename: target.filename,
    fullPath: uploaded.fullPath,
    path: uploaded.path,
    provider: uploaded.provider,
  });
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
  if (!access.ok) return access.response;

  try {
    const requestContentType = request.headers.get('content-type') ?? '';
    if (requestContentType.toLowerCase().includes('multipart/form-data')) {
      return uploadExternalProjectAssetDirect(request, access);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid upload body' },
        { status: 400 }
      );
    }

    const payload = uploadUrlSchema.parse(body);
    const target = buildExternalProjectAssetUploadTarget({
      access,
      collectionType: payload.collectionType,
      contentType: payload.contentType,
      entrySlug: payload.entrySlug,
      filename: payload.filename,
      size: payload.size,
      upsert: payload.upsert ?? false,
    });

    if (!target.ok) return target.response;

    const storageProvider = await resolveWorkspaceStorageProvider(
      access.normalizedWorkspaceId
    );
    if (storageProvider.provider === WORKSPACE_STORAGE_PROVIDER_SUPABASE) {
      return NextResponse.json(
        {
          error:
            'Direct upload is required for Supabase-backed external assets.',
        },
        { status: 409 }
      );
    }

    const uploadPayload = await createWorkspaceStorageUploadPayload(
      access.normalizedWorkspaceId,
      target.filename,
      {
        path: target.storageDirectory,
        contentType: target.contentType,
        size: payload.size,
        upsert: payload.upsert ?? false,
      }
    );

    return NextResponse.json({
      contentType: uploadPayload.contentType,
      filename: uploadPayload.filename,
      fullPath: uploadPayload.fullPath,
      headers: uploadPayload.headers,
      path: uploadPayload.path,
      provider: uploadPayload.provider,
      signedUrl: uploadPayload.signedUrl,
      token: uploadPayload.token,
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to upload external project asset', {
      error,
    });
    return NextResponse.json(
      { error: 'Failed to upload external project asset' },
      { status: 500 }
    );
  }
}
