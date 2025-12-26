import { createClient } from '@tuturuuu/supabase/next/server';
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
    description: z.string().nullable().optional(), // Plain text (TipTap handles conversion)
    priority: z
      .enum(['critical', 'high', 'normal', 'low'])
      .nullable()
      .optional(),
    lead_id: z.string().nullable().optional(),
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

async function updateProject(
  request: NextRequest,
  params: Promise<{ wsId: string; projectId: string }>
) {
  try {
    const { wsId, projectId } = await params;
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

    // If lead_id is being set, verify the user belongs to the workspace
    if (validatedData.lead_id !== undefined && validatedData.lead_id !== null) {
      const { data: leadMembership } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', wsId)
        .eq('user_id', validatedData.lead_id)
        .single();

      if (!leadMembership) {
        return NextResponse.json(
          { error: 'Lead user is not a member of this workspace' },
          { status: 400 }
        );
      }
    }

    // Update project
    const { data: updatedProject, error: updateError } = await supabase
      .from('task_projects')
      .update(updateData)
      .eq('id', projectId)
      .eq('ws_id', wsId)
      .select(`
        *,
        lead:workspace_members(...users(
          id,
          display_name,
          avatar_url
        )),
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
      .single();

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
  _request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  try {
    const { wsId, projectId } = await params;
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

    // Delete project
    const { error: deleteError } = await supabase
      .from('task_projects')
      .delete()
      .eq('id', projectId)
      .eq('ws_id', wsId);

    if (deleteError) {
      console.error('Error deleting project:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete project' },
        { status: 500 }
      );
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
