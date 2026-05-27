import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../../route-auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; id: string }> }
) {
  try {
    const { wsId, id } = await params;
    const auth = await resolveWorkspaceStorageRouteAuth(request, wsId);
    if (!auth.ok) {
      return auth.response;
    }
    const { normalizedWsId } = auth.context;

    const supabase = await createDynamicAdminClient();
    const { data: object, error } = await supabase
      .schema('storage')
      .from('objects')
      .select('id, name, metadata, bucket_id, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error || !object) {
      return NextResponse.json({ message: 'File not found' }, { status: 404 });
    }

    // Ensure the file belongs to the workspace
    const prefix = `${normalizedWsId}/`;
    if (!object.name.startsWith(prefix)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const relativePath = object.name.substring(prefix.length);

    return NextResponse.json({
      data: {
        id: object.id,
        name: object.name.split('/').pop() || '',
        path: relativePath,
        fullPath: object.name,
        bucketId: object.bucket_id,
        size: (object.metadata as any)?.size ?? 0,
        mimetype:
          (object.metadata as any)?.mimetype || 'application/octet-stream',
        createdAt: object.created_at,
        updatedAt: object.updated_at,
      },
    });
  } catch (error) {
    logWorkspaceStorageRouteError(
      'Unexpected error fetching storage object by ID:',
      error
    );
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
