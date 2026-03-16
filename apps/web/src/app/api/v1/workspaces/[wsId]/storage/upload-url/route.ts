import { posix } from 'node:path';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  path: z.string().max(1024).optional(),
  upsert: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    const permissions = await getPermissions({ wsId: normalizedWsId, request });

    if (!permissions) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (permissions.withoutPermission('manage_drive')) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const parsed = uploadUrlSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const sanitizedPath = sanitizePath(parsed.data.path || '');
    if (sanitizedPath === null) {
      return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
    }

    const sanitizedFilename = sanitizeFilename(parsed.data.filename);
    if (!sanitizedFilename) {
      return NextResponse.json(
        { message: 'Invalid filename' },
        { status: 400 }
      );
    }

    const storagePath = sanitizedPath
      ? posix.join(normalizedWsId, sanitizedPath, sanitizedFilename)
      : posix.join(normalizedWsId, sanitizedFilename);

    const { data, error } = await sbAdmin.storage
      .from('workspaces')
      .createSignedUploadUrl(storagePath, {
        upsert: parsed.data.upsert ?? false,
      });

    if (error || !data?.signedUrl || !data?.token) {
      console.error('Error creating storage upload URL:', error);
      return NextResponse.json(
        { message: 'Failed to generate upload URL' },
        { status: 500 }
      );
    }

    const prefix = `${normalizedWsId}/`;
    const relativePath = storagePath.startsWith(prefix)
      ? storagePath.substring(prefix.length)
      : storagePath;

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: relativePath,
      fullPath: storagePath,
    });
  } catch (error) {
    console.error('Upload URL error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
