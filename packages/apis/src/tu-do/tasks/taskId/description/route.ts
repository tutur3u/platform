import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TaskActorRpcArgs } from '@tuturuuu/types/db';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { deriveTaskDescriptionYjsState } from '@tuturuuu/utils/yjs-task-description';
import { type NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { paramsSchema, updateTaskDescriptionSchema } from './schema';

async function requireWorkspaceTaskAccess(
  request: NextRequest,
  rawParams: unknown
) {
  const { wsId: rawWsId, taskId } = paramsSchema.parse(rawParams);
  const supabase = await createClient(request);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const memberCheck = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!memberCheck.ok) {
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
    const normalizedDescription =
      body.description !== undefined
        ? body.description?.trim() || null
        : undefined;
    const normalizedYjsState =
      body.description_yjs_state !== undefined
        ? body.description_yjs_state
        : normalizedDescription !== undefined
          ? deriveTaskDescriptionYjsState(normalizedDescription)
          : undefined;

    const updatePayload = {
      ...(normalizedDescription !== undefined
        ? { description: normalizedDescription }
        : {}),
      ...(normalizedYjsState !== undefined
        ? { description_yjs_state: normalizedYjsState }
        : {}),
    };

    const updateTaskPayload: TaskActorRpcArgs<'update_task_fields_with_actor'> =
      {
        p_task_id: taskId,
        p_task_updates: updatePayload,
        p_actor_user_id: user.id,
      };
    const { data, error } = await sbAdmin
      .rpc('update_task_fields_with_actor', updateTaskPayload)
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
