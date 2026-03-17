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

    let jsonBody: unknown;
    try {
      jsonBody = await request.json();
    } catch (error) {
      console.error('Malformed JSON in resolve-workspace request:', error);
      return NextResponse.json(
        { error: 'Malformed JSON body' },
        { status: 400 }
      );
    }

    const body = requestSchema.safeParse(jsonBody);
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
        throw new Error('WORKSPACE_MEMBERSHIP_LOOKUP_FAILED');
      }

      return !!membership;
    };

    const candidateWorkspaceIds = new Set<string>();

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

      if (board?.ws_id) {
        candidateWorkspaceIds.add(board.ws_id);
      }
    }

    if (body.data.projectIds.length > 0) {
      const projectIds = body.data.projectIds;
      const batchSize = 1000;

      for (let i = 0; i < projectIds.length; i += batchSize) {
        const batchIds = projectIds.slice(i, i + batchSize);
        const { data: projects, error: projectError } = await supabase
          .from('task_projects')
          .select('ws_id')
          .in('id', batchIds);

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

        if (!projects || projects.length === 0) {
          continue;
        }

        for (const project of projects) {
          if (project.ws_id) {
            candidateWorkspaceIds.add(project.ws_id);
          }
        }
      }
    }

    if (candidateWorkspaceIds.size === 0) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    if (candidateWorkspaceIds.size > 1) {
      return NextResponse.json(
        { error: 'Conflicting workspaces for supplied IDs' },
        { status: 409 }
      );
    }

    const [workspaceId] = Array.from(candidateWorkspaceIds);

    try {
      const hasAccess = await hasWorkspaceAccess(workspaceId!);
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Workspace not found' },
          { status: 404 }
        );
      }
    } catch (error) {
      console.error('Error during workspace membership verification:', error);
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    return NextResponse.json({ workspaceId });
  } catch (error) {
    console.error('Error resolving task project workspace:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
