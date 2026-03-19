import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { paramsSchema, updateTaskDescriptionSchema } from './schema';

async function requireWorkspaceTaskAccess(
  request: NextRequest,
  rawParams: unknown
) {
  const { wsId: rawWsId, taskId } = paramsSchema.parse(rawParams);
  const supabase = await createClient(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const { data: memberCheck, error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError) {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!memberCheck) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  const sbAdmin = await createAdminClient();
  const { data: taskContext, error: taskError } = await sbAdmin
    .from('tasks')
    .select(
      `
      id,
      task_lists!inner (
        workspace_boards!inner (
          ws_id
        )
      )
    `
    )
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle();

  if (taskError) {
    return {
      error: NextResponse.json(
        { error: 'Failed to load task' },
        { status: 500 }
      ),
    };
  }

  if (
    !taskContext ||
    taskContext.task_lists?.workspace_boards?.ws_id !== wsId
  ) {
    return {
      error: NextResponse.json({ error: 'Task not found' }, { status: 404 }),
    };
  }

  return { sbAdmin, taskId, user };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const access = await requireWorkspaceTaskAccess(request, await params);
    if ('error' in access) return access.error;

    const { sbAdmin, taskId } = access;
    const { data, error } = await sbAdmin
      .from('tasks')
      .select('description, description_yjs_state')
      .eq('id', taskId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching task description:', error);
      return NextResponse.json(
        { error: 'Failed to fetch task description' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({
      description: data.description,
      description_yjs_state: data.description_yjs_state,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    console.error('Error fetching task description:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const access = await requireWorkspaceTaskAccess(request, await params);
    if ('error' in access) return access.error;

    const { sbAdmin, taskId, user } = access;
    const body = updateTaskDescriptionSchema.parse(await request.json());
    const updatePayload = {
      ...(body.description !== undefined
        ? { description: body.description?.trim() || null }
        : {}),
      ...(body.description_yjs_state !== undefined
        ? { description_yjs_state: body.description_yjs_state }
        : {}),
    };

    const { data, error } = await sbAdmin
      .rpc('update_task_fields_with_actor', {
        p_task_id: taskId,
        p_task_updates: updatePayload,
        p_actor_user_id: user.id,
      })
      .maybeSingle();

    if (error) {
      console.error('Error updating task description:', error);
      return NextResponse.json(
        { error: 'Failed to update task description' },
        { status: 500 }
      );
    }

    if (!data || data.id !== taskId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({
      description: data.description,
      description_yjs_state: data.description_yjs_state,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating task description:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
