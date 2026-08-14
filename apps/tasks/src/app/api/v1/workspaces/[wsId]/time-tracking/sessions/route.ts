import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

type Params = { wsId: string };

const createSessionSchema = z.object({
  categoryId: z.guid().nullable().optional(),
  description: z.string().nullable().optional(),
  taskId: z.guid().nullable().optional(),
  title: z.string().trim().min(1),
});

async function resolveWorkspaceAccess(
  wsId: string,
  userId: string,
  supabase: TypedSupabaseClient,
  sbAdmin: TypedSupabaseClient
): Promise<
  { normalizedWsId: string; ok: true } | { ok: false; response: NextResponse }
> {
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const membership = await verifyWorkspaceMembershipType({
    // Satellite session clients authenticate the actor through an app-session
    // token, but do not carry Supabase auth context for RLS. Use the admin
    // client for this actor-aware membership lookup after withSessionAuth has
    // verified userId.
    supabase: sbAdmin,
    userId,
    wsId: normalizedWsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  return { normalizedWsId, ok: true };
}

export const GET = withSessionAuth<Params>(
  async (request, { user, supabase }, { wsId }) => {
    const type = new URL(request.url).searchParams.get('type');
    if (type !== 'running') {
      return NextResponse.json(
        { error: 'Only running task sessions are supported in Tasks' },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();
    const access = await resolveWorkspaceAccess(
      wsId,
      user.id,
      supabase,
      sbAdmin
    );
    if (!access.ok) return access.response;
    const { data: session, error } = await sbAdmin
      .from('time_tracking_sessions')
      .select('*, category:time_tracking_categories(id, name, color)')
      .eq('ws_id', access.normalizedWsId)
      .eq('user_id', user.id)
      .eq('is_running', true)
      .maybeSingle();

    if (error) {
      console.error('Failed to load the running task session:', error);
      return NextResponse.json(
        { error: 'Failed to load the running session' },
        { status: 500 }
      );
    }

    if (!session?.task_id) {
      return NextResponse.json({
        session: session ? { ...session, task: null } : null,
      });
    }

    const { data: task, error: taskError } = await sbAdmin
      .from('tasks')
      .select(
        'id, name, list:task_lists!inner(board:workspace_boards!inner(ws_id))'
      )
      .eq('id', session.task_id)
      .eq('list.board.ws_id', access.normalizedWsId)
      .maybeSingle();

    if (taskError) {
      console.error('Failed to load the running session task:', taskError);
      return NextResponse.json(
        { error: 'Failed to load the running session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      session: {
        ...session,
        task: task ? { id: task.id, name: task.name } : null,
      },
    });
  }
);

export const POST = withSessionAuth<Params>(
  async (request, { user, supabase }, { wsId }) => {
    const validation = createSessionSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.issues },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();
    const access = await resolveWorkspaceAccess(
      wsId,
      user.id,
      supabase,
      sbAdmin
    );
    if (!access.ok) return access.response;
    const { categoryId, description, taskId, title } = validation.data;

    if (taskId) {
      const { data: task, error: taskError } = await sbAdmin
        .from('tasks')
        .select('id, task_lists!inner(workspace_boards!inner(ws_id))')
        .eq('id', taskId)
        .maybeSingle();

      if (taskError) {
        console.error('Failed to validate the timer task:', taskError);
        return NextResponse.json(
          { error: 'Failed to validate task' },
          { status: 500 }
        );
      }

      if (
        !task ||
        task.task_lists?.workspace_boards?.ws_id !== access.normalizedWsId
      ) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
    }

    const now = new Date().toISOString();
    const { error: closeError } = await sbAdmin
      .from('time_tracking_sessions')
      .update({ end_time: now, is_running: false, updated_at: now })
      .eq('ws_id', access.normalizedWsId)
      .eq('user_id', user.id)
      .eq('is_running', true);

    if (closeError) {
      console.error('Failed to close the active task session:', closeError);
      return NextResponse.json(
        { error: 'Failed to close active session' },
        { status: 500 }
      );
    }

    const { data: session, error } = await sbAdmin
      .from('time_tracking_sessions')
      .insert({
        category_id: categoryId ?? null,
        created_at: now,
        description: description?.trim() || null,
        is_running: true,
        start_time: now,
        task_id: taskId ?? null,
        title,
        updated_at: now,
        user_id: user.id,
        ws_id: access.normalizedWsId,
      })
      .select('*, category:time_tracking_categories(*), task:tasks(id, name)')
      .single();

    if (error) {
      console.error('Failed to start the task session:', error);
      return NextResponse.json(
        { error: 'Failed to start timer' },
        { status: 500 }
      );
    }

    return NextResponse.json({ session }, { status: 201 });
  }
);
