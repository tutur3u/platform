import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const requestSchema = z
  .object({
    boardId: z.string().uuid().optional(),
    projectIds: z.array(z.string().uuid()).default([]),
  })
  .refine((value) => !!value.boardId || value.projectIds.length > 0, {
    message: 'boardId or projectIds is required',
  });

export async function POST(request: Request) {
  try {
    const supabase = await createClient(request);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = requestSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: body.error.issues[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    const hasWorkspaceAccess = async (workspaceId: string) => {
      const { data: membership, error: membershipError } = await supabase
        .from('workspace_members')
        .select('ws_id')
        .eq('ws_id', workspaceId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (membershipError) {
        console.error(
          'Failed to verify workspace membership:',
          membershipError
        );
        return false;
      }

      return !!membership;
    };

    if (body.data.boardId) {
      const { data: board, error: boardError } = await supabase
        .from('workspace_boards')
        .select('ws_id')
        .eq('id', body.data.boardId)
        .maybeSingle();

      if (boardError) {
        console.error('Failed to resolve workspace from board:', boardError);
        return NextResponse.json(
          { error: 'Failed to resolve workspace' },
          { status: 500 }
        );
      }

      if (board?.ws_id && (await hasWorkspaceAccess(board.ws_id))) {
        return NextResponse.json({ workspaceId: board.ws_id });
      }
    }

    if (body.data.projectIds.length > 0) {
      const { data: project, error: projectError } = await supabase
        .from('task_projects')
        .select('ws_id')
        .in('id', body.data.projectIds)
        .limit(1)
        .maybeSingle();

      if (projectError) {
        console.error(
          'Failed to resolve workspace from projects:',
          projectError
        );
        return NextResponse.json(
          { error: 'Failed to resolve workspace' },
          { status: 500 }
        );
      }

      if (project?.ws_id && (await hasWorkspaceAccess(project.ws_id))) {
        return NextResponse.json({ workspaceId: project.ws_id });
      }
    }

    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  } catch (error) {
    console.error('Error resolving task project workspace:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
