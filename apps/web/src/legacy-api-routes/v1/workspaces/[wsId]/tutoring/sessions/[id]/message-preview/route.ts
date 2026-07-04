import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string; id: string }>;
}

function displayName(
  value: {
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null
) {
  if (!value) return 'N/A';
  return (
    value.full_name?.trim() ||
    value.display_name?.trim() ||
    value.email?.trim() ||
    'N/A'
  );
}

function formatDateOnly(dateString: string) {
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
}

export async function POST(request: Request, { params }: Params) {
  const { wsId, id } = await params;
  const supabase = await createClient(request);
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({
    wsId: normalizedWsId,
    request,
  });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (permissions.withoutPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const tutoringSessionsClient = sbAdmin.schema('private');
  const { data, error } = await tutoringSessionsClient
    .from('workspace_tutoring_sessions')
    .select(
      `
      id,
      reason_type,
      session_date,
      start_time,
      group_id,
      student_user_id,
      teacher_user_id
    `
    )
    .eq('id', id)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load tutoring session for preview', error);
    return NextResponse.json(
      { message: 'Failed to load session' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }

  const reasonLabel =
    data.reason_type === 'ABSENT_RECOVERY'
      ? 'bù buổi vắng'
      : data.reason_type === 'WEAK_SUPPORT'
        ? 'hỗ trợ học lực'
        : 'phụ đạo';

  const [groupResult, studentResult, teacherResult] = await Promise.all([
    sbAdmin
      .from('workspace_user_groups')
      .select('name')
      .eq('id', data.group_id)
      .maybeSingle(),
    sbAdmin
      .from('workspace_users')
      .select('full_name,display_name,email')
      .eq('id', data.student_user_id)
      .maybeSingle(),
    data.teacher_user_id
      ? sbAdmin
          .from('workspace_users')
          .select('full_name,display_name,email')
          .eq('id', data.teacher_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (groupResult.error || studentResult.error || teacherResult.error) {
    console.error('Failed to load tutoring preview relations', {
      error: groupResult.error ?? studentResult.error ?? teacherResult.error,
      sessionId: id,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Failed to load session' },
      { status: 500 }
    );
  }

  const student = studentResult.data;
  const teacher = teacherResult.data;
  const group = groupResult.data;
  const studentName = displayName(student);

  const preview = [
    `Xin chào phụ huynh ${studentName},`,
    `${studentName} sẽ tham gia buổi ${reasonLabel} vào ${formatDateOnly(data.session_date)} lúc ${String(data.start_time).slice(0, 5)}.`,
    `Lớp/Nhóm: ${group?.name ?? 'N/A'}.`,
    `Giáo viên phụ trách: ${displayName(teacher)}.`,
    'Xin cảm ơn.',
  ].join(' ');

  const { error: updateError } = await tutoringSessionsClient
    .from('workspace_tutoring_sessions')
    .update({ parent_message_preview: preview })
    .eq('id', id)
    .eq('ws_id', normalizedWsId);

  if (updateError) {
    console.error('Failed to save tutoring message preview', updateError);
    return NextResponse.json(
      { message: 'Failed to save message preview' },
      { status: 500 }
    );
  }

  return NextResponse.json({ preview });
}
