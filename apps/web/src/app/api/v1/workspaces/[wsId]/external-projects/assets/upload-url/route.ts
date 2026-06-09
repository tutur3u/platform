import { posix } from 'node:path';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  createWorkspaceStorageUploadPayload,
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
    const collectionType = sanitizePath(payload.collectionType);
    const entrySlug = sanitizePath(payload.entrySlug);
    const filename = sanitizeFilename(payload.filename);

    if (!collectionType || !entrySlug || !filename) {
      return NextResponse.json(
        { error: 'Invalid upload path' },
        { status: 400 }
      );
    }

    const uploadValidation = validateWorkspaceStorageUploadMetadata({
      allowExternalProjectAssets: true,
      contentType: payload.contentType,
      filename,
      size: payload.size,
    });
    if (!uploadValidation.ok) {
      return NextResponse.json(
        { error: uploadValidation.message },
        { status: uploadValidation.status }
      );
    }

    const filenameWithSuffix =
      payload.upsert === true
        ? filename
        : `${generateRandomUUID()}-${filename}`;
    const storagePath = posix.join(
      'external-projects',
      access.binding.adapter ?? 'shared',
      collectionType,
      entrySlug
    );
    const uploadPayload = await createWorkspaceStorageUploadPayload(
      access.normalizedWorkspaceId,
      filenameWithSuffix,
      {
        path: storagePath,
        contentType: uploadValidation.contentType,
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
