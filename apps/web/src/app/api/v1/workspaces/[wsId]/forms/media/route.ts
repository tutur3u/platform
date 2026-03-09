import crypto from 'node:crypto';
import { posix } from 'node:path';
import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceRouteContext } from '@/features/forms/route-utils';

const requestSchema = z.object({
  filename: z.string().min(1).max(255),
  scope: z.enum(['cover', 'section', 'option']).default('section'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId: wsIdParam } = await params;
    const context = await getWorkspaceRouteContext(request, wsIdParam);

    if (!context.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!context.isMember || !context.canManageForms) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = requestSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? 'Invalid media payload',
        },
        { status: 400 }
      );
    }

    const sanitizedFilename = sanitizeFilename(parsed.data.filename);

    if (!sanitizedFilename) {
      return NextResponse.json(
        { error: 'Invalid filename supplied' },
        { status: 400 }
      );
    }

    const storagePath = posix.join(
      context.wsId,
      'forms',
      parsed.data.scope,
      `${crypto.randomUUID()}-${sanitizedFilename}`
    );

    const { data: uploadData, error: uploadError } =
      await context.adminClient.storage
        .from('workspaces')
        .createSignedUploadUrl(storagePath, {
          upsert: true,
        });

    if (uploadError || !uploadData?.signedUrl || !uploadData.token) {
      throw new Error(uploadError?.message ?? 'Failed to create upload URL');
    }

    return NextResponse.json({
      signedUrl: uploadData.signedUrl,
      token: uploadData.token,
      storagePath,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
