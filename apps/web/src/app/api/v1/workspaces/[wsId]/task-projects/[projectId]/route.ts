import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateProjectSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Project name is required')
      .max(255, 'Project name too long')
      .transform((val) => val.trim())
      .refine((val) => val.length > 0, {
        message: 'Project name cannot be empty or whitespace only',
      })
      .optional(),
    description: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(), // Plain text (TipTap handles conversion)
    priority: z
      .enum(['critical', 'high', 'normal', 'low'])
      .nullable()
      .optional(),
    lead_id: z.string().max(MAX_NAME_LENGTH).nullable().optional(),
    start_date: z.iso.datetime().nullable().optional(),
    end_date: z.iso.datetime().nullable().optional(),
    health_status: z
      .enum(['on_track', 'at_risk', 'off_track'])
      .nullable()
      .optional(),
    status: z
      .enum([
        'backlog',
        'planned',
        'in_progress',
        'in_review',
        'in_testing',
        'completed',
        'cancelled',
        'active',
        'on_hold',
      ])
      .optional(),
    archived: z.boolean().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // Validate that end_date is not before start_date when both are present
    if (data.start_date && data.end_date) {
      const startDate = new Date(data.start_date);
      const endDate = new Date(data.end_date);
      if (endDate < startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End date must be the same or after start date',
          path: ['end_date'],
        });
      }
    }
  });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  try {
    const { wsId: rawWsId, projectId } = await params;
    const supabase = await createClient(request);
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      console.error('Membership lookup failed:', membership.error);
      return NextResponse.json(
        { error: 'Membership lookup failed' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const permissions = await getPermissions({ wsId, request });
    if (!permissions?.containsPermission('manage_projects')) {
      return NextResponse.json(
        { error: "You don't have permission to perform this operation" },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    const { data: project, error: projectError } = await sbAdmin
      .from('task_projects')
      .select(
        `
        *,
        creator:users!task_projects_creator_id_fkey(id, display_name, avatar_url),
        lead:users!task_projects_lead_id_fkey(id, display_name, avatar_url)
      `
      )
      .eq('id', projectId)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (projectError) {
      return NextResponse.json(
        { error: projectError.message || 'Internal server error' },
        { status: 500 }
      );
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error(
      'Error in GET /api/v1/workspaces/[wsId]/task-projects/[projectId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function updateProject(
  request: NextRequest,
  params: Promise<{ wsId: string; projectId: string }>
) {
  try {
    const { wsId: rawWsId, projectId } = await params;
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
        { error: 'Membership lookup failed' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const permissions = await getPermissions({ wsId, request });
    if (!permissions?.containsPermission('manage_projects')) {
      return NextResponse.json(
        { error: "You don't have permission to perform this operation" },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = updateProjectSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0]?.message || 'Invalid data' },
        { status: 400 }
      );
    }

    const validatedData = validationResult.data;

    // Build update object with only provided fields
    type UpdateData = Partial<{
      name: string;
      description: string | null;
      priority: 'critical' | 'high' | 'normal' | 'low' | null;
      lead_id: string | null;
      start_date: string | null;
      end_date: string | null;
      health_status: 'on_track' | 'at_risk' | 'off_track' | null;
      status:
        | 'backlog'
        | 'planned'
        | 'in_progress'
        | 'in_review'
        | 'in_testing'
        | 'completed'
        | 'cancelled'
        | 'active'
        | 'on_hold';
      archived: boolean | null;
    }>;

    const updateData: UpdateData = {};
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined) {
      updateData.description = validatedData.description || null;
    }
    if (validatedData.priority !== undefined)
      updateData.priority = validatedData.priority;
    if (validatedData.lead_id !== undefined)
      updateData.lead_id = validatedData.lead_id;
    if (validatedData.start_date !== undefined)
      updateData.start_date = validatedData.start_date;
    if (validatedData.end_date !== undefined)
      updateData.end_date = validatedData.end_date;
    if (validatedData.health_status !== undefined)
      updateData.health_status = validatedData.health_status;
    if (validatedData.status !== undefined)
      updateData.status = validatedData.status;
    if (validatedData.archived !== undefined)
      updateData.archived = validatedData.archived;

    // Reject empty updates
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided to update' },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();

    // If lead_id is being set, verify the user belongs to the workspace
    if (validatedData.lead_id !== undefined && validatedData.lead_id !== null) {
      const leadMembership = await verifyWorkspaceMembershipType({
        wsId,
        userId: validatedData.lead_id,
        supabase,
      });

      if (leadMembership.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { error: 'Membership lookup failed' },
          { status: 500 }
        );
      }

      if (!leadMembership.ok) {
        return NextResponse.json(
          { error: 'Lead user is not a member of this workspace' },
          { status: 400 }
        );
      }
    }

    // Update project
    const { data: updatedProject, error: updateError } = await sbAdmin
      .from('task_projects')
      .update(updateData)
      .eq('id', projectId)
      .eq('ws_id', wsId)
      .select(`
        *,
        lead:users!task_projects_lead_id_fkey(
          id,
          display_name,
          avatar_url
        ),
        task_project_tasks(
          task:tasks(
            id,
            name,
            completed,
            task_lists(
              name
            )
          )
        )
      `)
      .maybeSingle();

    if (updateError) {
      console.error('Error updating project:', updateError);
      return NextResponse.json(
        { error: 'Failed to update project' },
        { status: 500 }
      );
    }

    if (!updatedProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: updatedProject.id,
      name: updatedProject.name,
      description: updatedProject.description,
      priority: updatedProject.priority,
      lead_id: updatedProject.lead_id,
      lead: updatedProject.lead,
      start_date: updatedProject.start_date,
      end_date: updatedProject.end_date,
      health_status: updatedProject.health_status,
      status: updatedProject.status,
      archived: updatedProject.archived,
      created_at: updatedProject.created_at,
      updated_at: updatedProject.updated_at,
      creator_id: updatedProject.creator_id,
      tasksCount: updatedProject.task_project_tasks?.length ?? 0,
      linkedTasks:
        updatedProject.task_project_tasks?.flatMap((link) =>
          link.task
            ? [
                {
                  id: link.task.id,
                  name: link.task.name,
                  completed: link.task.completed,
                  listName: link.task.task_lists?.name ?? null,
                },
              ]
            : []
        ) ?? [],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in PUT /api/v1/workspaces/[wsId]/task-projects/[projectId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Export both PUT and PATCH to handle both methods
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  return updateProject(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  return updateProject(request, params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  try {
    const { wsId: rawWsId, projectId } = await params;
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
        { error: 'Membership lookup failed' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const permissions = await getPermissions({ wsId, request });
    if (!permissions?.containsPermission('manage_projects')) {
      return NextResponse.json(
        { error: "You don't have permission to perform this operation" },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Delete project
    const { data: deletedProjects, error: deleteError } = await sbAdmin
      .from('task_projects')
      .delete()
      .eq('id', projectId)
      .eq('ws_id', wsId)
      .select('id');

    if (deleteError) {
      console.error('Error deleting project:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete project' },
        { status: 500 }
      );
    }

    if (!deletedProjects || deletedProjects.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      'Error in DELETE /api/v1/workspaces/[wsId]/task-projects/[projectId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
