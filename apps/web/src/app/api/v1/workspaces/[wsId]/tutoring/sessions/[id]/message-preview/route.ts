import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

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
  const { data, error } = await sbAdmin
    .from('workspace_tutoring_sessions')
    .select(
      `
      id,
      reason_type,
      session_date,
      start_time,
      group:workspace_user_groups!workspace_tutoring_sessions_group_id_fkey(name),
      student:workspace_users!workspace_tutoring_sessions_student_user_id_fkey(full_name,display_name,email),
      teacher:workspace_users!workspace_tutoring_sessions_teacher_user_id_fkey(full_name,display_name,email)
    `
    )
    .eq('id', id)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  if (error) {
    serverLogger.error('Failed to load tutoring session for preview', error);
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
  const student = data.student as {
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
  const teacher = data.teacher as {
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
  const group = data.group as { name: string | null } | null;
  const studentName = displayName(student);

  const preview = [
    `Xin chào phụ huynh ${studentName},`,
    `${studentName} sẽ tham gia buổi ${reasonLabel} vào ${formatDateOnly(data.session_date)} lúc ${String(data.start_time).slice(0, 5)}.`,
    `Lớp/Nhóm: ${group?.name ?? 'N/A'}.`,
    `Giáo viên phụ trách: ${displayName(teacher)}.`,
    'Xin cảm ơn.',
  ].join(' ');

  const { error: updateError } = await sbAdmin
    .from('workspace_tutoring_sessions')
    .update({ parent_message_preview: preview })
    .eq('id', id)
    .eq('ws_id', normalizedWsId);

  if (updateError) {
    serverLogger.error('Failed to save tutoring message preview', updateError);
    return NextResponse.json(
      { message: 'Failed to save message preview' },
      { status: 500 }
    );
  }

  return NextResponse.json({ preview });
}
