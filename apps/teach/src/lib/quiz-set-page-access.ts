import { getSatelliteWorkspacePermissions } from '@tuturuuu/satellite/workspace-access';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { notFound } from 'next/navigation';
import { resolveRouteWorkspace } from './resolve-route-workspace';

export async function requireQuizSetPageAccess(
  routeWsId: string,
  setId: string
) {
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const permissions = await getSatelliteWorkspacePermissions(
    'teach',
    resolvedWsId
  );
  if (!permissions || permissions.withoutPermission('ai_lab')) notFound();

  const admin = await createAdminClient();
  const { data: quizSet, error } = await admin
    .from('workspace_quiz_sets')
    .select('*')
    .eq('id', setId)
    .eq('ws_id', resolvedWsId)
    .maybeSingle();
  if (error) throw error;
  if (!quizSet) notFound();
  return { quizSet, resolvedWsId };
}
