import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTutoringRouteAccess } from '@/lib/tutoring/route-access';
import { denyWeakContentEdit } from '@/lib/tutoring/weak-content-access';

interface Params {
  params: Promise<{ wsId: string }>;
}

const EndWeakSupportSchema = z.object({
  groupId: z.string().uuid(),
  studentUserId: z.string().uuid(),
});

/**
 * "Thoát kèm": takes a learner off weak-support tutoring for one class by
 * clearing the attention flag on that class's feedback. The feedback text is
 * kept as history; already scheduled sessions stay for staff to manage.
 */
export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const { normalizedWsId, permissions } = await resolveTutoringRouteAccess(
    request,
    wsId
  );

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
  const parsed = EndWeakSupportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const denied = await denyWeakContentEdit({
    permissions,
    sbAdmin,
    touchesWeakContent: true,
    wsId: normalizedWsId,
  });
  if (denied) return denied;

  const [studentResult, groupResult] = await Promise.all([
    sbAdmin
      .from('workspace_users')
      .select('id')
      .eq('id', parsed.data.studentUserId)
      .eq('ws_id', normalizedWsId)
      .maybeSingle(),
    sbAdmin
      .from('workspace_user_groups')
      .select('id')
      .eq('id', parsed.data.groupId)
      .eq('ws_id', normalizedWsId)
      .maybeSingle(),
  ]);
  if (studentResult.error || groupResult.error) {
    console.error('Failed to verify weak-support learner', {
      error: studentResult.error ?? groupResult.error,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Failed to end tutoring' },
      { status: 500 }
    );
  }
  if (!studentResult.data || !groupResult.data) {
    return NextResponse.json(
      { message: 'Learner or class not found' },
      { status: 404 }
    );
  }

  const { data, error } = await sbAdmin
    .from('user_feedbacks')
    .update({ require_attention: false })
    .eq('user_id', parsed.data.studentUserId)
    .eq('group_id', parsed.data.groupId)
    .eq('require_attention', true)
    .select('id');

  if (error) {
    console.error('Failed to end weak-support tutoring', {
      error,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Failed to end tutoring' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success', cleared: data?.length ?? 0 });
}
