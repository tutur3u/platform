import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  createTutoringRequestClient,
  resolveTutoringRouteAccess,
} from '@/lib/tutoring/route-access';
import { tutorCommentsEnabled } from '@/lib/tutoring/tutor-comments';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; id: string }> }
) {
  const { wsId, id } = await params;
  const access = await resolveTutoringRouteAccess(request, wsId);
  const { permissions, normalizedWsId } = access;
  if (!permissions || !(await tutorCommentsEnabled(normalizedWsId)))
    return NextResponse.json({}, { status: 404 });
  if (permissions.withoutPermission('view_user_groups'))
    return NextResponse.json({}, { status: 403 });
  const db = await createAdminClient();
  const { data: session, error } = await db
    .schema('private')
    .from('workspace_tutoring_sessions')
    .select('group_id,teacher_user_id,tutor_comment')
    .eq('ws_id', normalizedWsId)
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({}, { status: 500 });
  if (!session) return NextResponse.json({}, { status: 404 });
  if (
    permissions.withoutPermission('admin') &&
    permissions.withoutPermission('approve_reports')
  ) {
    const actor =
      access.user ??
      (
        await (
          await createTutoringRequestClient(request, access.user)
        ).auth.getUser()
      ).data.user;
    if (!actor) return NextResponse.json({}, { status: 403 });
    const { data: link, error: linkError } = await db
      .from('workspace_user_linked_users')
      .select('virtual_user_id')
      .eq('ws_id', normalizedWsId)
      .eq('platform_user_id', actor.id)
      .maybeSingle();
    if (linkError || !link) return NextResponse.json({}, { status: 403 });
    if (link.virtual_user_id !== session.teacher_user_id) {
      const { data: teacher, error: teacherError } = await db
        .from('workspace_user_groups_users')
        .select('user_id')
        .eq('group_id', session.group_id)
        .eq('user_id', link.virtual_user_id)
        .eq('role', 'TEACHER')
        .maybeSingle();
      if (teacherError || !teacher)
        return NextResponse.json({}, { status: 403 });
    }
  }
  return NextResponse.json({ tutorComment: session.tutor_comment });
}
