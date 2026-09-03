import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveAuthenticatedSessionUser } from '@/lib/app-session-user';

export async function authorizeTaskUpdateInteraction(
  request: NextRequest,
  {
    projectId,
    updateId,
    wsId,
  }: { projectId: string; updateId: string; wsId: string }
) {
  const { authError, supabase, user } =
    await resolveAuthenticatedSessionUser(request);
  if (authError || !user || !supabase) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as const;
  }

  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const membership = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId: user.id,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    } as const;
  }

  if (!membership.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    } as const;
  }

  const { data: update, error } = await supabase
    .from('task_project_updates')
    .select('id, project_id, task_projects!inner(ws_id)')
    .eq('id', updateId)
    .eq('project_id', projectId)
    .eq('task_projects.ws_id', normalizedWsId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('Error loading task project update:', error);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Failed to load update' },
        { status: 500 }
      ),
    } as const;
  }

  if (!update) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Update not found' }, { status: 404 }),
    } as const;
  }

  return { ok: true, supabase, user } as const;
}
