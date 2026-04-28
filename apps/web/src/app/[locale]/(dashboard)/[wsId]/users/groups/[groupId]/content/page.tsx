import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import { CourseBuilderClient } from '../../../../education/courses/[courseId]/builder/course-builder-client';

export const metadata: Metadata = {
  title: 'Group Content Builder',
  description: 'Build and publish course modules within your user group.',
};

interface Props {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

export default async function GroupContentPage({ params }: Props) {
  const { wsId: routeWsId, groupId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const permissions = await getPermissions({ wsId: resolvedWsId });
  if (!permissions?.containsPermission('manage_users')) {
    notFound();
  }

  const sbAdmin = await createAdminClient();

  const { data: group, error: groupError } = await sbAdmin
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', resolvedWsId)
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) throw groupError;
  if (!group) notFound();

  return (
    <CourseBuilderClient
      courseId={groupId}
      courseName={group.name}
      resolvedWsId={resolvedWsId}
      routeWsId={routeWsId}
    />
  );
}
