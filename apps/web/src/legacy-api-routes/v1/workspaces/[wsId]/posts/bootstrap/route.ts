import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { buildDefaultPostsDateRange } from '@/app/[locale]/(dashboard)/[wsId]/posts/search-params.server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId: rawWsId } = await params;

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let wsId: string;
  try {
    wsId = await normalizeWorkspaceId(rawWsId, supabase);
  } catch {
    return NextResponse.json(
      { message: 'Workspace not found' },
      { status: 404 }
    );
  }

  const { data: workspace, error } = await supabase
    .from('workspaces')
    .select('id, timezone, workspace_members!inner(user_id)')
    .eq('id', wsId)
    .eq('workspace_members.user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching workspace' },
      { status: 500 }
    );
  }

  if (!workspace) {
    return NextResponse.json(
      { message: 'Workspace not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    wsId: workspace.id,
    defaultDateRange: buildDefaultPostsDateRange(workspace.timezone),
  });
}
