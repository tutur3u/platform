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
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();

  const { wsId: id } = await params;
  const wsId = await normalizeWorkspaceId(id, supabase);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions || permissions.withoutPermission('manage_documents')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const search = url.searchParams.get('search')?.trim() ?? '';
  const parsedLimit = Number.parseInt(
    url.searchParams.get('limit') ?? '50',
    10
  );
  const parsedOffset = Number.parseInt(
    url.searchParams.get('offset') ?? '0',
    10
  );
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 100)
    : 50;
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

  let query = sbAdmin
    .from('workspace_documents')
    .select('id, name, content, is_public, created_at', { count: 'exact' })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error listing documents:', error.message);
    return NextResponse.json(
      { message: 'Error listing documents' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data ?? [],
    pagination: {
      limit,
      offset,
      filteredTotal: count ?? 0,
    },
  });
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const data = await req.json();

  const { wsId: id } = await params;
  const wsId = await normalizeWorkspaceId(id, supabase);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions || permissions.withoutPermission('manage_documents')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data: doc, error } = await sbAdmin
    .from('workspace_documents')
    .insert({
      ...data,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating document' },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: doc.id, message: 'success' });
}
