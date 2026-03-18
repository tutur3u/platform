import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { CreateTaskWithRelationshipResult } from '@tuturuuu/types/primitives/TaskRelationship';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  listId: z.uuid(),
  currentTaskId: z.uuid(),
  relationshipType: z.enum(['parent_child', 'blocks', 'related']),
  currentTaskIsSource: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId: rawWsId } = await params;
    const supabase = await createClient(request);
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const body = bodySchema.parse(await request.json());
    const sbAdmin = await createAdminClient();

    const { data: listCheck, error: listError } = await sbAdmin
      .from('task_lists')
      .select('id, deleted, workspace_boards!inner(ws_id)')
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

      return NextResponse.json({ error: message }, { status: 500 });
    }

    const result = data as unknown as CreateTaskWithRelationshipResult;

    return NextResponse.json({
      task: result.task,
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
