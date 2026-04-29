import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TaskActorRpcArgs } from '@tuturuuu/types/db';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  taskId: z.guid(),
});

const payloadSchema = z.object({
  labelId: z.guid(),
});

async function parseJsonBody(request: NextRequest) {
  try {
    return { data: await request.json(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

async function verifyTaskInWorkspace(
  wsId: string,
  taskId: string,
  sbAdmin: TypedSupabaseClient
) {
  const { data: taskRow, error: taskError } = await sbAdmin
    .from('tasks')
    .select(
      `
      id,
      list:task_lists!inner(
        board:workspace_boards!inner(
          ws_id
        )
      )
    `
    )
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle();

  if (taskError) {
    return { error: 'Failed to load task', status: 500 } as const;
  }

  if (!taskRow || taskRow.list?.board?.ws_id !== wsId) {
    return { error: 'Task not found', status: 404 } as const;
  }

  return null;
}

async function verifyWorkspaceMembership(
  wsId: string,
  userId: string,
  supabase: TypedSupabaseClient
) {
  const membership = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: userId,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      error: 'Failed to verify workspace membership',
      status: 500,
    } as const;
  }

  if (!membership.ok) {
    return { error: 'Forbidden', status: 403 } as const;
  }

  return null;
}

async function verifyLabelInWorkspace(
  wsId: string,
  labelId: string,
  supabase: TypedSupabaseClient
) {
  const { data: label, error: labelError } = await supabase
    .from('workspace_task_labels')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', labelId)
    .maybeSingle();

  if (labelError) {
    return { error: 'Failed to validate label', status: 500 } as const;
  }

  if (!label) {
    return {
      error: 'Label not found or does not belong to this workspace',
      status: 404,
    } as const;
  }

  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(parsedParams.data.wsId, supabase);

    const membershipCheck = await verifyWorkspaceMembership(
      wsId,
      user.id,
      supabase
    );
    if (membershipCheck) {
      return NextResponse.json(
        { error: membershipCheck.error },
        { status: membershipCheck.status }
      );
    }

    const jsonResult = await parseJsonBody(request);
    if (jsonResult.error) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }
    const body = payloadSchema.safeParse(jsonResult.data);
    if (!body.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: body.error.issues },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();
    const taskCheck = await verifyTaskInWorkspace(
      wsId,
      parsedParams.data.taskId,
      sbAdmin
    );
    if (taskCheck) {
      return NextResponse.json(
        { error: taskCheck.error },
        { status: taskCheck.status }
      );
    }

    const labelCheck = await verifyLabelInWorkspace(
      wsId,
      body.data.labelId,
      supabase
    );
    if (labelCheck) {
      return NextResponse.json(
        { error: labelCheck.error },
        { status: labelCheck.status }
      );
    }

    const addLabelPayload: TaskActorRpcArgs<'add_task_label_with_actor'> = {
      p_task_id: parsedParams.data.taskId,
      p_label_id: body.data.labelId,
      p_actor_user_id: user.id,
    };
    const { error: insertError } = await sbAdmin.rpc(
      'add_task_label_with_actor',
      addLabelPayload
    );

    if (insertError && insertError.code !== '23505') {
      console.error('Failed to add task label:', insertError);
      return NextResponse.json(
        { error: 'Failed to add label to task' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in task labels POST route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(parsedParams.data.wsId, supabase);

    const membershipCheck = await verifyWorkspaceMembership(
      wsId,
      user.id,
      supabase
    );
    if (membershipCheck) {
      return NextResponse.json(
        { error: membershipCheck.error },
        { status: membershipCheck.status }
      );
    }

    const jsonResult = await parseJsonBody(request);
    if (jsonResult.error) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }
    const body = payloadSchema.safeParse(jsonResult.data);
    if (!body.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: body.error.issues },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();
    const taskCheck = await verifyTaskInWorkspace(
      wsId,
      parsedParams.data.taskId,
      sbAdmin
    );
    if (taskCheck) {
      return NextResponse.json(
        { error: taskCheck.error },
        { status: taskCheck.status }
      );
    }

    const labelCheck = await verifyLabelInWorkspace(
      wsId,
      body.data.labelId,
      supabase
    );
    if (labelCheck) {
      return NextResponse.json(
        { error: labelCheck.error },
        { status: labelCheck.status }
      );
    }

    const removeLabelPayload: TaskActorRpcArgs<'remove_task_label_with_actor'> =
      {
        p_task_id: parsedParams.data.taskId,
        p_label_id: body.data.labelId,
        p_actor_user_id: user.id,
      };
    const { error: deleteError } = await sbAdmin.rpc(
      'remove_task_label_with_actor',
      removeLabelPayload
    );

    if (deleteError) {
      console.error('Failed to remove task label:', deleteError);
      return NextResponse.json(
        { error: 'Failed to remove label from task' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in task labels DELETE route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
