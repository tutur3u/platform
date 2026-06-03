import { posix } from 'node:path';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { triggerWorkspaceStorageAutoExtract } from '@/lib/workspace-storage-auto-extract';
import {
  uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import { validateWorkspaceStorageUploadMetadata } from '@/lib/workspace-storage-upload-policy';

const uploadFormSchema = z.object({
  collectionType: z.string().min(1).max(120),
  entrySlug: z.string().min(1).max(120),
  upsert: z.enum(['true', 'false']).optional(),
});

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
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Invalid upload body' },
        { status: 400 }
      );
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const payload = uploadFormSchema.parse({
      collectionType: formData.get('collectionType'),
      entrySlug: formData.get('entrySlug'),
      upsert: formData.get('upsert') || undefined,
    });
    const collectionType = sanitizePath(payload.collectionType);
    const entrySlug = sanitizePath(payload.entrySlug);
    const filename = sanitizeFilename(file.name);

    if (!collectionType || !entrySlug || !filename) {
      return NextResponse.json(
        { error: 'Invalid upload path' },
        { status: 400 }
      );
    }

    const uploadValidation = validateWorkspaceStorageUploadMetadata({
      allowExternalProjectAssets: true,
      contentType: file.type,
      filename,
      size: file.size,
    });
    if (!uploadValidation.ok) {
      return NextResponse.json(
        { error: uploadValidation.message },
        { status: uploadValidation.status }
      );
    }

    const filenameWithSuffix =
      payload.upsert === 'true'
        ? filename
        : `${generateRandomUUID()}-${filename}`;
    const storagePath = posix.join(
      'external-projects',
      access.binding.adapter ?? 'shared',
      collectionType,
      entrySlug
    );
    const targetPath = posix.join(storagePath, filenameWithSuffix);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const data = await uploadWorkspaceStorageFileDirect(
      access.normalizedWorkspaceId,
      targetPath,
      buffer,
      {
        contentType: uploadValidation.contentType,
        upsert: payload.upsert === 'true',
      }
    );
    let autoExtract = null;
    let autoExtractError: string | null = null;

    try {
      autoExtract = await triggerWorkspaceStorageAutoExtract(
        access.normalizedWorkspaceId,
        {
          path: data.path,
          contentType:
            uploadValidation.contentType || 'application/octet-stream',
          originalFilename: filename,
          requestOrigin: new URL(request.url).origin,
        }
      );
    } catch (error) {
      autoExtractError =
        error instanceof Error
          ? error.message
          : 'Failed to trigger auto extraction';
    }

    return NextResponse.json({
      autoExtract,
      autoExtractError,
      contentType: uploadValidation.contentType,
      data: {
        fullPath: data.fullPath,
        path: data.path,
      },
      filename: filenameWithSuffix,
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
