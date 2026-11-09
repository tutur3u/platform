import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { getFeatureFlag } from '@tuturuuu/utils/feature-flags';
import {
  documentPatchSchema,
  hasHierarchyFields,
} from '@/lib/documents/payload';

interface Params {
  params: Promise<{
    wsId: string;
    documentId: string;
  }>;
}

async function authorizeDocumentsRequest(request: Request, wsIdParam: string) {
  const supabase = await createClient(request);
  const wsId = await normalizeWorkspaceId(wsIdParam, supabase);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  const permissions = await getPermissions({ wsId, request });
  if (!permissions || permissions.withoutPermission('manage_documents')) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return { wsId };
}

export async function PATCH(req: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const { wsId: wsIdParam, documentId } = await params;
  const auth = await authorizeDocumentsRequest(req, wsIdParam);
  if ('error' in auth) return auth.error;

  const parsed = documentPatchSchema.safeParse(
    await req.json().catch(() => undefined)
  );
  if (!parsed.success)
    return NextResponse.json(
      { message: 'Invalid document payload' },
      { status: 400 }
    );
  const data = parsed.data;
  if (
    hasHierarchyFields(data) &&
    !(await getFeatureFlag(auth.wsId, 'ENABLE_DOCUMENT_HIERARCHY'))
  ) {
    return NextResponse.json(
      { message: 'Document hierarchy is disabled' },
      { status: 403 }
    );
  }

  const { data: document, error } = await sbAdmin
    .from('workspace_documents')
    .update(data)
    .eq('id', documentId)
    .eq('ws_id', auth.wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error updating document:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json(
    { message: 'Document updated successfully' },
    { status: 200 }
  );
}

export async function GET(request: Request, { params }: Params) {
  await connection();
  const sbAdmin = await createAdminClient();
  const { wsId: wsIdParam, documentId } = await params;
  const auth = await authorizeDocumentsRequest(request, wsIdParam);
  if ('error' in auth) return auth.error;

  const hierarchyEnabled = await getFeatureFlag(
    auth.wsId,
    'ENABLE_DOCUMENT_HIERARCHY'
  );
  const { data, error } = await sbAdmin
    .from('workspace_documents')
    .select(
      hierarchyEnabled
        ? 'id, name, content, is_public, created_at, parent_id, position'
        : 'id, name, content, is_public, created_at'
    )
    .eq('id', documentId)
    .eq('ws_id', auth.wsId)
    .maybeSingle();

  if (error) {
    console.error('Error loading document:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const { wsId: wsIdParam, documentId } = await params;
  const auth = await authorizeDocumentsRequest(request, wsIdParam);
  if ('error' in auth) return auth.error;

  const { data, error } = await sbAdmin
    .from('workspace_documents')
    .delete()
    .eq('id', documentId)
    .eq('ws_id', auth.wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error deleting document:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json(
    { message: 'Document deleted successfully' },
    { status: 200 }
  );
}
