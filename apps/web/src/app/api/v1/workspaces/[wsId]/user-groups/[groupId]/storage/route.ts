import { createClient } from '@tuturuuu/supabase/next/server';
import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createWorkspaceStorageUploadPayload,
  deleteWorkspaceStorageObjectByPath,
  listWorkspaceStorageDirectory,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; groupId: string }> }
) {
  try {
    const { wsId, groupId } = await params;
    const supabase = await createClient(request);
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    const permissions = await getPermissions({ wsId: normalizedWsId, request });

    if (!permissions || !permissions.containsPermission('view_user_groups')) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const result = await listWorkspaceStorageDirectory(normalizedWsId, {
      path: `user-groups/${groupId}`,
    });

    return NextResponse.json({ data: result.data });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  upsert: z.boolean().optional(),
  size: z.number().int().min(0).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; groupId: string }> }
) {
  try {
    const { wsId, groupId } = await params;
    const supabase = await createClient(request);
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    const permissions = await getPermissions({ wsId: normalizedWsId, request });

    if (!permissions || !permissions.containsPermission('update_user_groups')) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = uploadUrlSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const sanitizedFilename = sanitizeFilename(parsed.data.filename);
    if (!sanitizedFilename) {
      return NextResponse.json(
        { message: 'Invalid filename' },
        { status: 400 }
      );
    }

    const filenameWithSuffix =
      parsed.data.upsert === true
        ? sanitizedFilename
        : `${generateRandomUUID()}-${sanitizedFilename}`;

    const uploadPayload = await createWorkspaceStorageUploadPayload(
      normalizedWsId,
      filenameWithSuffix,
      {
        path: `user-groups/${groupId}`,
        upsert: parsed.data.upsert ?? false,
        size: parsed.data.size,
      }
    );

    return NextResponse.json({
      signedUrl: uploadPayload.signedUrl,
      token: uploadPayload.token,
      headers: uploadPayload.headers,
      path: uploadPayload.path,
      fullPath: uploadPayload.fullPath,
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ wsId: string; groupId: string }> }
) {
  try {
    const { wsId, groupId } = await params;
    const supabase = await createClient(request);
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    const permissions = await getPermissions({ wsId: normalizedWsId, request });

    if (!permissions || !permissions.containsPermission('update_user_groups')) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const filename = url.searchParams.get('filename');

    if (!filename) {
      return NextResponse.json(
        { message: 'Filename required' },
        { status: 400 }
      );
    }

    const sanitizedFilename = sanitizeFilename(filename);
    if (!sanitizedFilename) {
      return NextResponse.json(
        { message: 'Invalid filename' },
        { status: 400 }
      );
    }

    await deleteWorkspaceStorageObjectByPath(
      normalizedWsId,
      `user-groups/${groupId}/${sanitizedFilename}`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
