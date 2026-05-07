import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { TutoringMarkSchema } from '../../../shared';

interface Params {
  params: Promise<{ wsId: string; id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { wsId, id } = await params;
  const permissions = await getPermissions({ wsId, request });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (permissions.withoutPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = TutoringMarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const resolvedAt =
    parsed.data.attendanceStatus === 'DONE' ? new Date().toISOString() : null;
  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_tutoring_sessions')
    .update({
      attendance_status: parsed.data.attendanceStatus,
      resolved_at: resolvedAt,
    })
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    serverLogger.error('Failed to mark tutoring session', error);
    return NextResponse.json(
      { message: 'Failed to mark session' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'success' });
}
