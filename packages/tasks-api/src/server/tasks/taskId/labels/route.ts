import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TaskActorRpcArgs } from '@tuturuuu/types/db';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  addPersonalTaskLabel,
  removePersonalTaskLabel,
} from '../../personal-overlays';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  taskId: z.guid(),
});

const payloadSchema = z.object({
  labelId: z.guid(),
});

export type TaskLabelRouteAuthContext = {
  appSession?: boolean;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
};

type TaskLabelRouteContext = {
  params: Promise<{ wsId: string; taskId: string }>;
};

type TaskLabelRequestAuth =
  | {
      auth: TaskLabelRouteAuthContext;
    }
  | {
      error: NextResponse;
    };

async function resolveTaskLabelRequestAuth(
  request: NextRequest,
  auth?: TaskLabelRouteAuthContext
): Promise<TaskLabelRequestAuth> {
  if (auth) {
    return {
      auth: {
        ...auth,
        appSession: auth.appSession === true,
      },
    };
  }

  const supabase = await createClient(request);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return {
    auth: {
      appSession: false,
      supabase,
      user,
    },
  };
}

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

async function verifyPersonalExternalTaskAccess(
  wsId: string,
  taskId: string,
  userId: string,
  supabase: TypedSupabaseClient,
  sbAdmin: TypedSupabaseClient
) {
  const { data: workspace, error: workspaceError } = await sbAdmin
    .from('workspaces')
    .select('personal')
    .eq('id', wsId)
    .maybeSingle();

  if (workspaceError) {
    return {
      ok: false,
      error: 'Failed to validate workspace',
      status: 500,
    } as const;
  }

  if (workspace?.personal !== true) {
    return { ok: false, error: 'Task not found', status: 404 } as const;
  }

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
    return {
      ok: false,
      error: 'Failed to load task',
      status: 500,
    } as const;
  }

  const sourceWsId = taskRow?.list?.board?.ws_id;
  if (!sourceWsId || sourceWsId === wsId) {
    return { ok: false, error: 'Task not found', status: 404 } as const;
  }

  const sourceMembership = await verifyWorkspaceMembershipType({
    wsId: sourceWsId,
    userId,
    supabase,
  });

  if (sourceMembership.error === 'membership_lookup_failed') {
    return {
      ok: false,
      error: 'Failed to verify source task access',
      status: 500,
    } as const;
  }

  if (!sourceMembership.ok) {
    return { ok: false, error: 'Task not found', status: 404 } as const;
  }

  return { ok: true } as const;
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

export async function handleTaskLabelRoutePOST(
  request: NextRequest,
  { params }: TaskLabelRouteContext,
  authContext?: TaskLabelRouteAuthContext
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const resolvedAuth = await resolveTaskLabelRequestAuth(
      request,
      authContext
    );
    if ('error' in resolvedAuth) return resolvedAuth.error;
    const { supabase, user } = resolvedAuth.auth;

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
    const personalExternalTaskCheck = taskCheck
      ? await verifyPersonalExternalTaskAccess(
          wsId,
          parsedParams.data.taskId,
          user.id,
          supabase,
          sbAdmin
        )
      : null;

    if (taskCheck && !personalExternalTaskCheck?.ok) {
      return NextResponse.json(
        { error: personalExternalTaskCheck?.error ?? taskCheck.error },
        { status: personalExternalTaskCheck?.status ?? taskCheck.status }
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

    if (personalExternalTaskCheck?.ok) {
      await addPersonalTaskLabel(
        sbAdmin,
        user.id,
        parsedParams.data.taskId,
        body.data.labelId
      );

      return NextResponse.json({ success: true });
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  return handleTaskLabelRoutePOST(request, { params });
}

export async function handleTaskLabelRouteDELETE(
  request: NextRequest,
  { params }: TaskLabelRouteContext,
  authContext?: TaskLabelRouteAuthContext
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const resolvedAuth = await resolveTaskLabelRequestAuth(
      request,
      authContext
    );
    if ('error' in resolvedAuth) return resolvedAuth.error;
    const { supabase, user } = resolvedAuth.auth;

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
    const personalExternalTaskCheck = taskCheck
      ? await verifyPersonalExternalTaskAccess(
          wsId,
          parsedParams.data.taskId,
          user.id,
          supabase,
          sbAdmin
        )
      : null;

    if (taskCheck && !personalExternalTaskCheck?.ok) {
      return NextResponse.json(
        { error: personalExternalTaskCheck?.error ?? taskCheck.error },
        { status: personalExternalTaskCheck?.status ?? taskCheck.status }
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

    if (personalExternalTaskCheck?.ok) {
      await removePersonalTaskLabel(
        sbAdmin,
        user.id,
        parsedParams.data.taskId,
        body.data.labelId
      );

      return NextResponse.json({ success: true });
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  return handleTaskLabelRouteDELETE(request, { params });
}
