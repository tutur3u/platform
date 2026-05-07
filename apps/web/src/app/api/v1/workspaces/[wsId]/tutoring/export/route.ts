import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const QuerySchema = z.object({
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  mode: z.enum(['detailed', 'payroll']).default('detailed'),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

function nameOf(
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

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
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

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  let query = sbAdmin
    .from('workspace_tutoring_sessions')
    .select(
      `
      id,
      session_date,
      start_time,
      duration_minutes,
      reason_type,
      content,
      attendance_status,
      group:workspace_user_groups!workspace_tutoring_sessions_group_id_fkey(name),
      student:workspace_users!workspace_tutoring_sessions_student_user_id_fkey(full_name,display_name,email),
      teacher:workspace_users!workspace_tutoring_sessions_teacher_user_id_fkey(full_name,display_name,email)
    `
    )
    .eq('ws_id', wsId)
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (parsed.data.fromDate)
    query = query.gte('session_date', parsed.data.fromDate);
  if (parsed.data.toDate) query = query.lte('session_date', parsed.data.toDate);

  const { data, error } = await query;
  if (error) {
    serverLogger.error('Failed to export tutoring sessions', error);
    return NextResponse.json({ message: 'Export failed' }, { status: 500 });
  }

  if (parsed.data.mode === 'payroll') {
    const byTeacher = new Map<
      string,
      {
        teacher_name: string;
        completed_sessions: number;
        total_minutes: number;
      }
    >();

    for (const row of data ?? []) {
      if (row.attendance_status !== 'DONE') continue;
      const teacherName = nameOf(row.teacher as never);
      const key = teacherName;
      const current = byTeacher.get(key) ?? {
        teacher_name: teacherName,
        completed_sessions: 0,
        total_minutes: 0,
      };
      current.completed_sessions += 1;
      current.total_minutes += row.duration_minutes;
      byTeacher.set(key, current);
    }

    return NextResponse.json({
      mode: 'payroll',
      data: [...byTeacher.values()].sort((a, b) =>
        a.teacher_name.localeCompare(b.teacher_name)
      ),
    });
  }

  return NextResponse.json({
    mode: 'detailed',
    data: (data ?? []).map((row) => ({
      id: row.id,
      date: row.session_date,
      time: String(row.start_time).slice(0, 5),
      duration_minutes: row.duration_minutes,
      reason_type: row.reason_type,
      attendance_status: row.attendance_status,
      content: row.content,
      group_name: (row.group as { name: string | null } | null)?.name ?? 'N/A',
      student_name: nameOf(row.student as never),
      teacher_name: nameOf(row.teacher as never),
    })),
  });
}
