import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

interface SharedTaskParams {
  shareCode: string;
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<SharedTaskParams> }
) {
  try {
    const { shareCode } = await params;

    if (!shareCode) {
      return NextResponse.json(
        { error: 'Invalid share code' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const adminClient = await createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required to access shared tasks' },
        { status: 401 }
      );
    }

    // Look up share link (use admin client to bypass RLS)
    const { data: shareLink, error: shareLinkError } = await adminClient
      .from('task_share_links')
      .select(
        `
        id,
        task_id,
        code,
        public_access,
        requires_invite,
        created_at,
        tasks!inner (
          id,
          name,
          description,
          priority,
          start_date,
          end_date,
          created_at,
          completed_at,
          closed_at,
          estimation_points,
          display_number,
          list_id,
          task_lists!inner (
            id,
            name,
            workspace_boards!inner (
              id,
              name,
              ws_id,
              ticket_prefix,
              estimation_type,
              extended_estimation,
              allow_zero_estimates,
              workspaces!inner (
                id,
                name
              )
            )
          )
        )
      `
      )
      .eq('code', shareCode)
      .single();

    if (shareLinkError || !shareLink) {
      return NextResponse.json(
        { error: 'Share link not found or expired' },
        { status: 404 }
      );
    }

    // Determine eligibility and effective permission.
    // Eligible users: workspace members OR explicit task_shares recipients OR public_access (view-only).
    let isWorkspaceMember = false;
    let recipientPermission: 'view' | 'edit' | null = null;

    const wsId = shareLink.tasks?.task_lists?.workspace_boards?.ws_id;
    const boardId = shareLink.tasks?.task_lists?.workspace_boards?.id;

    if (wsId) {
      const { data: memberCheck } = await adminClient
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', wsId)
        .eq('user_id', user.id)
        .maybeSingle();

      isWorkspaceMember = Boolean(memberCheck);
    }

    const { data: userPrivateDetails } = await adminClient
      .from('user_private_details')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle();

    const email = userPrivateDetails?.email ?? null;

    let sharesQuery = adminClient
      .from('task_shares')
      .select('permission')
      .eq('task_id', shareLink.task_id);

    if (email) {
      sharesQuery = sharesQuery.or(
        `shared_with_user_id.eq.${user.id},shared_with_email.ilike.${email}`
      );
    } else {
      sharesQuery = sharesQuery.eq('shared_with_user_id', user.id);
    }

    const { data: shareRow } = await sharesQuery.maybeSingle();
    recipientPermission = shareRow?.permission ?? null;

    const hasPublicAccess = shareLink.public_access === 'view';
    const isEligible =
      isWorkspaceMember || Boolean(recipientPermission) || hasPublicAccess;

    if (!isEligible) {
      return NextResponse.json(
        { error: 'You do not have access to this shared task' },
        { status: 403 }
      );
    }

    if (
      shareLink.requires_invite &&
      !isWorkspaceMember &&
      !recipientPermission
    ) {
      return NextResponse.json(
        { error: 'You are not invited to access this shared task' },
        { status: 403 }
      );
    }

    // Effective permission for the current user.
    // - Workspace members: edit
    // - Invitees: their per-user share permission
    // - Public access: view only
    const effectivePermission: 'view' | 'edit' = (() => {
      if (isWorkspaceMember) return 'edit';
      return recipientPermission === 'edit' ? 'edit' : 'view';
    })();

    // Record usage
    await adminClient.from('task_share_link_uses').insert({
      share_link_id: shareLink.id,
      user_id: user.id,
    });

    // Get task assignees
    const { data: assignees } = await adminClient
      .from('task_assignees')
      .select(
        `
        user_id,
        users (
          id,
          display_name,
          handle,
          avatar_url
        )
      `
      )
      .eq('task_id', shareLink.task_id);

    // Get task labels
    const { data: labels } = await adminClient
      .from('task_labels')
      .select(
        `
        label_id,
        workspace_task_labels (
          id,
          name,
          color
        )
      `
      )
      .eq('task_id', shareLink.task_id);

    // Get task projects
    const { data: projects } = await adminClient
      .from('task_project_tasks')
      .select(
        `
        project_id,
        task_projects (
          id,
          name,
          status
        )
      `
      )
      .eq('task_id', shareLink.task_id);

    // Get all lists for the board
    const { data: availableLists } = await adminClient
      .from('task_lists')
      .select('*')
      .eq('board_id', boardId)
      .eq('deleted', false)
      .order('position')
      .order('created_at');

    // Get all workspace labels
    const { data: workspaceLabels } = await adminClient
      .from('workspace_task_labels')
      .select('id, name, color, created_at')
      .eq('ws_id', wsId)
      .order('name');

    // Get all workspace projects
    const { data: workspaceProjects } = await adminClient
      .from('task_projects')
      .select('id, name, status')
      .eq('ws_id', wsId)
      .eq('deleted', false)
      .order('name');

    // Get workspace members
    const { data: workspaceMembers } = await adminClient
      .from('workspace_members')
      .select(
        `
        user_id,
        users!inner (
          id,
          display_name,
          avatar_url
        )
      `
      )
      .eq('ws_id', wsId);

    // Enrich task with assignees, labels, and projects
    const task = {
      ...shareLink.tasks,
      assignees:
        assignees?.map((a) => ({
          id: a.users?.id,
          user_id: a.user_id,
          display_name: a.users?.display_name,
          handle: a.users?.handle,
          avatar_url: a.users?.avatar_url,
        })) || [],
      labels:
        labels
          ?.map((l) => l.workspace_task_labels)
          .filter(Boolean)
          .map((label) => ({
            id: label.id,
            name: label.name,
            color: label.color,
          })) || [],
      projects:
        projects
          ?.map((p) => p.task_projects)
          .filter(Boolean)
          .map((project) => ({
            id: project.id,
            name: project.name,
            status: project.status,
          })) || [],
    };

    const boardConfig = {
      id: boardId,
      name: shareLink.tasks?.task_lists?.workspace_boards?.name,
      ws_id: wsId,
      ticket_prefix:
        shareLink.tasks?.task_lists?.workspace_boards?.ticket_prefix,
      estimation_type:
        shareLink.tasks?.task_lists?.workspace_boards?.estimation_type,
      extended_estimation:
        shareLink.tasks?.task_lists?.workspace_boards?.extended_estimation,
      allow_zero_estimates:
        shareLink.tasks?.task_lists?.workspace_boards?.allow_zero_estimates,
    };

    return NextResponse.json({
      task,
      permission: effectivePermission,
      workspace: shareLink.tasks?.task_lists?.workspace_boards?.workspaces,
      board: {
        id: boardId,
        name: shareLink.tasks?.task_lists?.workspace_boards?.name,
      },
      list: {
        id: shareLink.tasks?.task_lists?.id,
        name: shareLink.tasks?.task_lists?.name,
      },
      // Additional data for TaskEditDialog
      boardConfig,
      availableLists: availableLists || [],
      workspaceLabels: workspaceLabels || [],
      workspaceProjects: workspaceProjects || [],
      workspaceMembers:
        workspaceMembers
          ?.filter((m) => m.user_id && m.users)
          .map((m) => ({
            id: m.user_id,
            user_id: m.user_id,
            display_name: m.users?.display_name || 'Unknown User',
            avatar_url: m.users?.avatar_url,
          })) || [],
    });
  } catch (error) {
    console.error('Error in GET /shared/tasks/[shareCode]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<SharedTaskParams> }
) {
  try {
    const { shareCode } = await params;

    if (!shareCode) {
      return NextResponse.json(
        { error: 'Invalid share code' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const adminClient = await createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Look up share link and verify edit permission
    const { data: shareLink, error: shareLinkError } = await adminClient
      .from('task_share_links')
      .select('id, task_id, public_access, requires_invite')
      .eq('code', shareCode)
      .single();

    if (shareLinkError || !shareLink) {
      return NextResponse.json(
        { error: 'Share link not found' },
        { status: 404 }
      );
    }

    // Verify edit permission under the single-link model:
    // - Workspace members can edit
    // - Invitees can edit only if their per-user share permission is edit
    // - Public access is view-only

    const { data: taskWs } = await adminClient
      .from('tasks')
      .select(
        `
        id,
        task_lists!inner (
          id,
          workspace_boards!inner (
            ws_id
          )
        )
      `
      )
      .eq('id', shareLink.task_id)
      .single();

    const wsId = taskWs?.task_lists?.workspace_boards?.ws_id;

    let isWorkspaceMember = false;
    if (wsId) {
      const { data: memberCheck } = await adminClient
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', wsId)
        .eq('user_id', user.id)
        .maybeSingle();

      isWorkspaceMember = Boolean(memberCheck);
    }

    if (!isWorkspaceMember) {
      const { data: userPrivateDetails } = await adminClient
        .from('user_private_details')
        .select('email')
        .eq('user_id', user.id)
        .maybeSingle();

      const email = userPrivateDetails?.email ?? null;

      let sharesQuery = adminClient
        .from('task_shares')
        .select('permission')
        .eq('task_id', shareLink.task_id)
        .eq('shared_with_user_id', user.id)
        .maybeSingle();

      if (email) {
        sharesQuery = adminClient
          .from('task_shares')
          .select('permission')
          .eq('task_id', shareLink.task_id)
          .or(
            `shared_with_user_id.eq.${user.id},shared_with_email.ilike.${email}`
          )
          .maybeSingle();
      }

      const { data: shareRow } = await sharesQuery;
      const recipientPermission = shareRow?.permission ?? null;

      if (recipientPermission !== 'edit') {
        return NextResponse.json(
          { error: 'You do not have edit permission for this task' },
          { status: 403 }
        );
      }
    }

    const taskUpdateSchema = z.object({
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      priority: z
        .enum(['critical', 'high', 'normal', 'low'])
        .nullable()
        .optional(),
      start_date: z.string().nullable().optional(),
      end_date: z.string().nullable().optional(),
      list_id: z.string().optional(),
      estimation_points: z.number().nullable().optional(),
    });

    const body = await request.json().catch(() => null);
    const validation = taskUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.issues },
        { status: 400 }
      );
    }

    const updates = validation.data;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update the task (use admin client to bypass RLS)
    const { data: updatedTask, error: updateError } = await adminClient
      .from('tasks')
      .update(updates)
      .eq('id', shareLink.task_id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Error updating task:', updateError);
      return NextResponse.json(
        { error: 'Failed to update task' },
        { status: 500 }
      );
    }

    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    console.error('Error in PATCH /shared/tasks/[shareCode]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
