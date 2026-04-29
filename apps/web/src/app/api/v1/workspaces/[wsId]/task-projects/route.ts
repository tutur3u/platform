import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId: rawWsId } = await params;
    const supabase = await createClient(request);
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    // Get current user
    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();
    const { searchParams } = new URL(request.url);
    const compact = searchParams.get('compact') === 'true';
    const requestedIds = [
      ...searchParams.getAll('id'),
      ...((searchParams.get('ids') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean) as string[]),
    ];
    const uniqueRequestedIds = [...new Set(requestedIds)];

    if (uniqueRequestedIds.length > 0) {
      const invalidId = uniqueRequestedIds.find(
        (projectId) => !z.guid().safeParse(projectId).success
      );

      if (invalidId) {
        return NextResponse.json(
          { error: 'Invalid project ID filter' },
          { status: 400 }
        );
      }
    }

    if (compact) {
      let compactQuery = sbAdmin
        .from('task_projects')
        .select('id, name, status')
        .eq('ws_id', wsId)
        .eq('deleted', false)
        .order('name', { ascending: true });

      if (uniqueRequestedIds.length > 0) {
        compactQuery = compactQuery.in('id', uniqueRequestedIds);
      }

      const { data: projects, error: projectsError } = await compactQuery;

      if (projectsError) {
        console.error('Error fetching task projects:', projectsError);
        return NextResponse.json(
          { error: 'Failed to fetch projects' },
          { status: 500 }
        );
      }

      return NextResponse.json(projects ?? []);
    }

    // Fetch task projects
    let projectsQuery = sbAdmin
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
      .eq('deleted', false)
      .order('created_at', { ascending: false });

    if (uniqueRequestedIds.length > 0) {
      projectsQuery = projectsQuery.in('id', uniqueRequestedIds);
    }

    const { data: projects, error: projectsError } = await projectsQuery;

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
    const { wsId: rawWsId } = await params;
    const supabase = await createClient(request);
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    // Get current user
    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

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
    const { data: project, error: projectError } = await sbAdmin
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
