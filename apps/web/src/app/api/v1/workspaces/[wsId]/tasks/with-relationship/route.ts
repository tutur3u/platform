import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { CreateTaskWithRelationshipResult } from '@tuturuuu/types/primitives/TaskRelationship';
import { MAX_TASK_NAME_LENGTH } from '@tuturuuu/utils/constants';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH),
  listId: z.uuid(),
  currentTaskId: z.uuid(),
  relationshipType: z.enum(['parent_child', 'blocks', 'related']),
  currentTaskIsSource: z.boolean(),
});

type RpcUser = {
  id?: string | null;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  handle?: string | null;
};

type RpcLabel = {
  id?: string | null;
  name?: string | null;
  color?: string | null;
  created_at?: string | null;
};

type RpcProject = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
};

type RelationshipRpcTask = Omit<
  CreateTaskWithRelationshipResult['task'],
  'assignees' | 'labels' | 'projects'
> & {
  board_id?: string | null;
  completed?: boolean | null;
  assignees?: Array<{ user?: RpcUser | null } | RpcUser | null>;
  labels?: Array<{ label?: RpcLabel | null } | RpcLabel | null>;
  projects?: Array<{ project?: RpcProject | null } | RpcProject | null>;
};

function unwrapRpcUser(
  entry: { user?: RpcUser | null } | RpcUser | null | undefined
): RpcUser | null {
  if (!entry) {
    return null;
  }

  if ('user' in entry) {
    return entry.user ?? null;
  }

  return entry as RpcUser;
}

function unwrapRpcLabel(
  entry: { label?: RpcLabel | null } | RpcLabel | null | undefined
): RpcLabel | null {
  if (!entry) {
    return null;
  }

  if ('label' in entry) {
    return entry.label ?? null;
  }

  return entry as RpcLabel;
}

function unwrapRpcProject(
  entry: { project?: RpcProject | null } | RpcProject | null | undefined
): RpcProject | null {
  if (!entry) {
    return null;
  }

  if ('project' in entry) {
    return entry.project ?? null;
  }

  return entry as RpcProject;
}

function normalizeCreatedTask(
  task: RelationshipRpcTask,
  listContext: {
    id: string;
    name: string | null;
    status: string | null;
    workspace_boards: {
      id: string;
      name: string | null;
      ws_id: string;
    } | null;
  }
) {
  const assignees = (task.assignees ?? []).flatMap((entry) => {
    const user = unwrapRpcUser(entry);
    if (!user?.id) {
      return [];
    }

    return [
      {
        id: user.id,
        display_name: user.display_name ?? null,
        email: user.email ?? null,
        avatar_url: user.avatar_url ?? null,
        handle: user.handle ?? null,
      },
    ];
  });

  const labels = (task.labels ?? []).flatMap((entry) => {
    const label = unwrapRpcLabel(entry);
    if (!label?.id || !label.name || !label.color || !label.created_at) {
      return [];
    }

    return [
      {
        id: label.id,
        name: label.name,
        color: label.color,
        created_at: label.created_at,
      },
    ];
  });

  const projects = (task.projects ?? []).flatMap((entry) => {
    const project = unwrapRpcProject(entry);
    if (!project?.id || !project.name) {
      return [];
    }

    return [
      {
        id: project.id,
        name: project.name,
        status: project.status ?? null,
      },
    ];
  });

  return {
    ...task,
    board_id: task.board_id ?? listContext.workspace_boards?.id ?? null,
    board_name: listContext.workspace_boards?.name ?? null,
    list_name: listContext.name,
    list_status: listContext.status,
    assignees,
    labels,
    projects,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId: rawWsId } = await params;
    const supabase = await createClient(request);

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const body = bodySchema.parse(await request.json());
    const sbAdmin = await createAdminClient();

    const { data: listCheck, error: listError } = await sbAdmin
      .from('task_lists')
      .select(
        'id, name, status, deleted, workspace_boards!inner(id, name, ws_id)'
      )
      .eq('id', body.listId)
      .maybeSingle();

    if (listError) {
      return NextResponse.json(
        { error: 'Failed to validate list' },
        { status: 500 }
      );
    }

    if (!listCheck || listCheck.workspace_boards?.ws_id !== wsId) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    if (listCheck.deleted) {
      return NextResponse.json({ error: 'List is archived' }, { status: 400 });
    }

    const { data: currentTask, error: currentTaskError } = await sbAdmin
      .from('tasks')
      .select('id, task_lists!inner(workspace_boards!inner(ws_id))')
      .eq('id', body.currentTaskId)
      .maybeSingle();

    if (currentTaskError) {
      return NextResponse.json(
        { error: 'Failed to validate related task' },
        { status: 500 }
      );
    }

    if (
      !currentTask ||
      currentTask.task_lists?.workspace_boards?.ws_id !== wsId
    ) {
      return NextResponse.json(
        { error: 'The task you are trying to relate to was not found' },
        { status: 404 }
      );
    }

    const { data, error } = await sbAdmin.rpc('create_task_with_relationship', {
      p_name: body.name,
      p_list_id: body.listId,
      p_current_task_id: body.currentTaskId,
      p_relationship_type: body.relationshipType,
      p_current_task_is_source: body.currentTaskIsSource,
    });

    if (error) {
      const message = error.message || 'Failed to create task relationship';
      if (message.includes('already exists')) {
        return NextResponse.json(
          { error: 'This relationship already exists.' },
          { status: 400 }
        );
      }
      if (message.includes('single parent')) {
        return NextResponse.json(
          { error: 'A task can only have one parent.' },
          { status: 400 }
        );
      }
      if (message.includes('circular')) {
        return NextResponse.json(
          {
            error:
              'This would create a circular relationship, which is not allowed.',
          },
          { status: 400 }
        );
      }

      console.error('create_task_with_relationship RPC failed:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    const result = data as unknown as CreateTaskWithRelationshipResult;
    const normalizedTask = normalizeCreatedTask(
      result.task as RelationshipRpcTask,
      listCheck
    );

    return NextResponse.json({
      task: normalizedTask,
      relationship: result.relationship,
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    console.error('Error creating task with relationship:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
