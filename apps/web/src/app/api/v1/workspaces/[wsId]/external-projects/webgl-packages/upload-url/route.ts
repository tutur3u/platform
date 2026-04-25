import { posix } from 'node:path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { isWebglZipUpload } from '@/lib/external-projects/webgl-packages';
import {
  createWorkspaceStorageUploadPayload,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import {
  buildWebglPackageUploadPath,
  getWebglPackageEntryContext,
  sanitizeWebglZipFilename,
} from '../shared';

const uploadUrlSchema = z.object({
  contentType: z.string().max(255).optional(),
  entryId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  size: z.number().int().positive().optional(),
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
    const payload = uploadUrlSchema.parse(await request.json());

    if (
      !isWebglZipUpload({
        contentType: payload.contentType,
        filename: payload.filename,
      })
    ) {
      return NextResponse.json(
        { error: 'WebGL package uploads must be ZIP archives.' },
        { status: 400 }
      );
    }

    const filename = sanitizeWebglZipFilename(payload.filename);
    if (!filename) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    const entry = await getWebglPackageEntryContext(
      access.admin,
      access.normalizedWorkspaceId,
      payload.entryId
    );
    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    const uploadPath = buildWebglPackageUploadPath({
      binding: access.binding,
      entry,
    });
    const uploadFilename = `${generateRandomUUID()}-${filename}`;
    const upload = await createWorkspaceStorageUploadPayload(
      access.normalizedWorkspaceId,
      uploadFilename,
      {
        contentType: payload.contentType || 'application/zip',
        path: uploadPath,
        size: payload.size,
        upsert: false,
      }
    );

    return NextResponse.json({
      ...upload,
      archivePath: posix.join(uploadPath, uploadFilename),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { details: error.flatten(), error: 'Invalid payload' },
        { status: 400 }
      );
    }

    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Failed to create WebGL package upload URL', error);
    return NextResponse.json(
      { error: 'Failed to create WebGL package upload URL' },
      { status: 500 }
    );
  }
}
