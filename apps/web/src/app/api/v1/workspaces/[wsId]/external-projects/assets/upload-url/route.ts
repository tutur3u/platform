import { posix } from 'node:path';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';

const uploadUrlSchema = z.object({
  collectionType: z.string().min(1).max(120),
  entrySlug: z.string().min(1).max(120),
  filename: z.string().min(1).max(255),
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
    const payload = uploadUrlSchema.parse(await request.json());
    const collectionType = sanitizePath(payload.collectionType);
    const entrySlug = sanitizePath(payload.entrySlug);
    const filename = sanitizeFilename(payload.filename);

    if (!collectionType || !entrySlug || !filename) {
      return NextResponse.json(
        { error: 'Invalid upload path' },
        { status: 400 }
      );
    }

    const filenameWithSuffix =
      payload.upsert === true
        ? filename
        : `${generateRandomUUID()}-${filename}`;
    const storagePath = posix.join(
      access.normalizedWorkspaceId,
      'external-projects',
      access.binding.adapter ?? 'shared',
      collectionType,
      entrySlug,
      filenameWithSuffix
    );

    const admin = await createDynamicAdminClient();
    const { data, error } = await admin.storage
      .from('workspaces')
      .createSignedUploadUrl(storagePath, {
        upsert: payload.upsert ?? false,
      });

    if (error || !data?.signedUrl || !data?.token) {
      console.error('Error creating external project upload URL:', error);
      return NextResponse.json(
        { error: 'Failed to generate upload URL' },
        { status: 500 }
      );
    }

    const prefix = `${access.normalizedWorkspaceId}/`;
    const relativePath = storagePath.startsWith(prefix)
      ? storagePath.substring(prefix.length)
      : storagePath;

    return NextResponse.json({
      fullPath: storagePath,
      path: relativePath,
      signedUrl: data.signedUrl,
      token: data.token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to create external project upload URL', error);
    return NextResponse.json(
      { error: 'Failed to create external project upload URL' },
      { status: 500 }
    );
  }
}
