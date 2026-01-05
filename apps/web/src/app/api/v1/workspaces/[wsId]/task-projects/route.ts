import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch task projects
    const { data: projects, error: projectsError } = await supabase
      .from('task_projects')
      .select(`
        *,
        creator:users!task_projects_creator_id_fkey(
          id,
          display_name,
          avatar_url
        ),
        lead:users!task_projects_lead_id_fkey(
          id,
          display_name,
          avatar_url
        ),
        task_project_tasks(
          task:tasks!inner(
            id,
            name,
            completed,
            completed_at,
            closed_at,
            deleted_at,
            priority,
            task_lists(
              name
            )
          )
        )
      `)
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false });

    if (projectsError) {
      console.error('Error fetching task projects:', projectsError);
      return NextResponse.json(
        { error: 'Failed to fetch projects' },
        { status: 500 }
      );
    }

    const formattedProjects = (projects ?? []).map((project) => {
      // Filter out soft-deleted tasks
      const activeTasks =
        project.task_project_tasks?.filter(
          (link) => link.task && link.task.deleted_at === null
        ) ?? [];

      return {
        ...project,
        created_at: project.created_at ?? new Date().toISOString(),
        tasksCount: activeTasks.length,
        completedTasksCount: activeTasks.filter(
          (link) =>
            link.task?.completed_at !== null || link.task?.closed_at !== null
        ).length,
        linkedTasks: activeTasks.flatMap(({ task }) =>
          task
            ? [
                {
                  id: task.id,
                  name: task.name,
                  completed_at: task.completed_at,
                  priority: task.priority,
                  listName: task.task_lists?.name ?? null,
                },
              ]
            : []
        ),
      };
    });

    return NextResponse.json(formattedProjects);
  } catch (error) {
    console.error(
      'Error in GET /api/v1/workspaces/[wsId]/task-projects:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { name, description } = z
      .object({
        name: z
          .string()
          .min(1, 'Project name is required')
          .max(255, 'Project name too long'),
        description: z.string().max(1000, 'Description too long').optional(),
      })
      .parse(body);

    // Create project
    const { data: project, error: projectError } = await supabase
      .from('task_projects')
      .insert({
        name,
        description: description || null,
        ws_id: wsId,
        creator_id: user.id,
      })
      .select('*')
      .single();

    if (projectError || !project) {
      console.error('Error creating project:', projectError);
      return NextResponse.json(
        { error: 'Failed to create project' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: project.id,
        name: project.name,
        description: project.description,
        created_at: project.created_at,
        creator_id: project.creator_id,
        creator: null,
        tasksCount: 0,
        linkedTasks: [],
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in POST /api/v1/workspaces/[wsId]/task-projects:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
