import {
  createClient,
  createDynamicAdminClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const deleteObjectSchema = z.object({
  path: z.string().min(1),
});

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const supabase = await createClient(request);
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({ wsId: normalizedWsId, request });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const parsed = deleteObjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const rawPath = parsed.data.path;
  const prefix = `${normalizedWsId}/`;
  const storagePath = rawPath.startsWith(prefix)
    ? rawPath
    : `${normalizedWsId}/${rawPath}`;

  const sbAdmin = await createDynamicAdminClient();
  const { error } = await sbAdmin.storage
    .from('workspaces')
    .remove([storagePath]);

  if (error) {
    console.error('Failed to delete storage object:', error);
    return NextResponse.json(
      { message: 'Failed to delete storage object' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
