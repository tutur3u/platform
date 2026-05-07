import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { format } from 'date-fns';
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

export async function POST(request: Request, { params }: Params) {
  const { wsId, id } = await params;
  const permissions = await getPermissions({ wsId, request });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (permissions.withoutPermission('view_user_groups')) {
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
    .eq('ws_id', wsId)
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
      ? 'Absent'
      : data.reason_type === 'WEAK_SUPPORT'
        ? 'Weak Support'
        : 'Tutoring';

  const preview = [
    `Xin chao phu huynh ${displayName(data.student as never)},`,
    `${displayName(data.student as never)} se tham gia buoi ho tro ${reasonLabel.toLowerCase()} vao ${format(new Date(data.session_date), 'dd/MM/yyyy')} luc ${String(data.start_time).slice(0, 5)}.`,
    `Lop/Nhom: ${(data.group as { name: string | null } | null)?.name ?? 'N/A'}.`,
    `Giao vien phu trach: ${displayName(data.teacher as never)}.`,
    'Xin cam on.',
  ].join(' ');

  const { error: updateError } = await sbAdmin
    .from('workspace_tutoring_sessions')
    .update({ parent_message_preview: preview })
    .eq('id', id)
    .eq('ws_id', wsId);

  if (updateError) {
    serverLogger.error('Failed to save tutoring message preview', updateError);
    return NextResponse.json(
      { message: 'Failed to save message preview' },
      { status: 500 }
    );
  }

  return NextResponse.json({ preview });
}
