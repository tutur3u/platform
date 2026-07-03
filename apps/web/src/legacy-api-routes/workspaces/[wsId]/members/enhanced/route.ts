import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  isWorkspaceUuidLiteral,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getWorkspaceMembers } from '@/lib/workspace-members';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const workspaceHandlePattern = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;

async function resolveWorkspaceIdForEnhancedMembers({
  rawWsId,
  request,
  supabase,
}: {
  rawWsId: string;
  request: NextRequest;
  supabase: TypedSupabaseClient;
}) {
  const trimmedWsId = rawWsId.trim();
  const resolvedWsId = resolveWorkspaceId(trimmedWsId);

  if (
    isWorkspaceUuidLiteral(resolvedWsId) ||
    resolvedWsId.toLowerCase() === PERSONAL_WORKSPACE_SLUG
  ) {
    return normalizeWorkspaceId(rawWsId, supabase, request);
  }

  const handle = trimmedWsId.toLowerCase();
  if (!workspaceHandlePattern.test(handle)) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select('id, workspace_members!inner(user_id)')
    .eq('handle', handle)
    .eq('workspace_members.user_id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { wsId: id } = await params;
  const supabase = await createClient(request);

  let wsId: string | null;
  try {
    wsId = await resolveWorkspaceIdForEnhancedMembers({
      rawWsId: id,
      request,
      supabase,
    });
  } catch {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  if (!wsId || !isWorkspaceUuidLiteral(wsId)) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const permissions = await getPermissions({ request, wsId });
  if (
    !permissions ||
    (permissions.withoutPermission('manage_workspace_members') &&
      permissions.withoutPermission('manage_workspace_roles'))
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get status filter from query params
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status');
  try {
    const sbAdmin = await createAdminClient();
    const members = await getWorkspaceMembers({
      supabase: sbAdmin,
      sbAdmin,
      wsId,
      status,
    });

    return NextResponse.json(members);
  } catch (error) {
    serverLogger.error('Error fetching workspace members:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace members' },
      { status: 500 }
    );
  }
}
