import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  SUPPORTED_COLORS,
  type SupportedColor,
} from '@tuturuuu/types/primitives/SupportedColors';
import {
  MAX_COLOR_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_TASK_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuthenticatedSessionUser } from '@/lib/app-session-user';
import type {
  SharedTaskEditResponse,
  SharedTaskRecord,
  SharedTaskResponse,
  SharedTaskViewResponse,
} from './response';

interface SharedTaskParams {
  shareCode: string;
}

function isSupportedColor(value: string | null): value is SupportedColor {
  return SUPPORTED_COLORS.some((color) => color === value);
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<SharedTaskParams> }
): Promise<NextResponse> {
  await connection();
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

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

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

    if (!wsId || !boardId) {
      return NextResponse.json(
        { error: 'Invalid task configuration' },
        { status: 500 }
      );
    }

    if (wsId) {
      const memberCheck = await verifyWorkspaceMembershipType({
        wsId: wsId,
        userId: user.id,
        supabase: adminClient,
      });

      if (memberCheck.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { error: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }

      isWorkspaceMember = memberCheck.ok;
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
        .eq('task_id', shareLink.task_id);

      if (email) {
        sharesQuery = sharesQuery.or(
          `shared_with_user_id.eq.${user.id},and(shared_with_email.ilike."${email}")`
        );
      } else {
        sharesQuery = sharesQuery.eq('shared_with_user_id', user.id);
      }

      const { data: shareRow } = await sharesQuery.maybeSingle();
      recipientPermission = shareRow?.permission ?? null;
    }

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

    // Record usage (only if no recent usage within the last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentUsage } = await adminClient
      .from('task_share_link_uses')
      .select('id')
      .eq('share_link_id', shareLink.id)
      .eq('user_id', user.id)
      .gte('accessed_at', oneHourAgo)
      .maybeSingle();

    if (!recentUsage) {
      await adminClient.from('task_share_link_uses').insert({
        share_link_id: shareLink.id,
        user_id: user.id,
      });
    }

    const [assigneeResult, labelResult, projectResult] = await Promise.all([
      adminClient
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
        .eq('task_id', shareLink.task_id),
      adminClient
        .from('task_labels')
        .select(
          `
          label_id,
          workspace_task_labels (
            id,
            name,
            color,
            created_at
          )
        `
        )
        .eq('task_id', shareLink.task_id),
      adminClient
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
        .eq('task_id', shareLink.task_id),
    ]);

    const taskSource = shareLink.tasks;
    const listSource = taskSource?.task_lists;
    const boardSource = listSource?.workspace_boards;
    const workspaceSource = boardSource?.workspaces;
    if (
      !taskSource?.name ||
      !taskSource.created_at ||
      !listSource?.id ||
      !listSource.name ||
      !boardSource?.name ||
      !workspaceSource?.id ||
      !workspaceSource.name
    ) {
      return NextResponse.json(
        { error: 'Invalid task configuration' },
        { status: 500 }
      );
    }

    const task: SharedTaskRecord = {
      id: taskSource.id,
      name: taskSource.name,
      description: taskSource.description ?? undefined,
      priority: taskSource.priority,
      start_date: taskSource.start_date ?? undefined,
      end_date: taskSource.end_date,
      created_at: taskSource.created_at,
      completed_at: taskSource.completed_at ?? undefined,
      closed_at: taskSource.closed_at ?? undefined,
      estimation_points: taskSource.estimation_points,
      display_number: taskSource.display_number ?? 0,
      list_id: taskSource.list_id ?? listSource.id,
      assignees:
        assigneeResult.data?.flatMap((a) =>
          a.users?.id
            ? [
                {
                  id: a.users?.id,
                  display_name: a.users.display_name ?? undefined,
                  handle: a.users.handle ?? undefined,
                  avatar_url: a.users.avatar_url ?? undefined,
                },
              ]
            : []
        ) || [],
      labels:
        labelResult.data
          ?.map((l) => l.workspace_task_labels)
          .filter(Boolean)
          .map((label) => ({
            id: label.id,
            name: label.name,
            color: label.color,
            created_at: label.created_at ?? taskSource.created_at,
          })) || [],
      projects:
        projectResult.data
          ?.map((p) => p.task_projects)
          .filter(Boolean)
          .map((project) => ({
            id: project.id,
            name: project.name,
            status: project.status ?? 'not_started',
          })) || [],
    };

    const baseResponse = {
      task,
      workspace: { id: workspaceSource.id, name: workspaceSource.name },
      board: { id: boardId, name: boardSource.name },
      list: { id: listSource.id, name: listSource.name },
    };

    if (effectivePermission === 'view') {
      const response: SharedTaskViewResponse = {
        ...baseResponse,
        permission: 'view',
      };
      return NextResponse.json<SharedTaskResponse>(response);
    }

    const [listsResult, labelsResult, projectsResult, membersResult] =
      await Promise.all([
        adminClient
          .from('task_lists')
          .select(
            'id, name, archived, deleted, created_at, board_id, creator_id, status, color, position'
          )
          .eq('board_id', boardId)
          .eq('deleted', false)
          .order('position')
          .order('created_at'),
        adminClient
          .from('workspace_task_labels')
          .select('id, name, color, created_at')
          .eq('ws_id', wsId)
          .order('name'),
        adminClient
          .from('task_projects')
          .select('id, name, status')
          .eq('ws_id', wsId)
          .eq('deleted', false)
          .order('name'),
        adminClient.rpc('get_task_board_workspace_members', {
          p_ws_id: wsId,
        }),
      ]);

    const response: SharedTaskEditResponse = {
      ...baseResponse,
      permission: 'edit',
      boardConfig: {
        id: boardId,
        name: boardSource.name,
        ws_id: wsId,
        ticket_prefix: boardSource.ticket_prefix ?? undefined,
        estimation_type: boardSource.estimation_type ?? undefined,
        extended_estimation: boardSource.extended_estimation ?? undefined,
        allow_zero_estimates: boardSource.allow_zero_estimates ?? undefined,
      },
      availableLists:
        listsResult.data?.flatMap((list) =>
          list.name &&
          list.created_at &&
          list.board_id &&
          list.creator_id &&
          list.status &&
          isSupportedColor(list.color) &&
          list.position !== null
            ? [
                {
                  id: list.id,
                  name: list.name,
                  archived: list.archived === true,
                  deleted: list.deleted === true,
                  created_at: list.created_at,
                  board_id: list.board_id,
                  creator_id: list.creator_id,
                  status: list.status,
                  color: list.color,
                  position: list.position,
                },
              ]
            : []
        ) || [],
      workspaceLabels: labelsResult.data || [],
      workspaceProjects:
        projectsResult.data?.map((project) => ({
          ...project,
          status: project.status ?? 'not_started',
        })) || [],
      workspaceMembers:
        membersResult.data?.flatMap((member) =>
          member.user_id
            ? [
                {
                  id: member.user_id,
                  user_id: member.user_id,
                  display_name: member.display_name || 'Unknown User',
                  avatar_url: member.avatar_url,
                },
              ]
            : []
        ) || [],
    };

    return NextResponse.json<SharedTaskResponse>(response);
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
): Promise<NextResponse> {
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

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

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
            ws_id,
            id
          )
        )
      `
      )
      .eq('id', shareLink.task_id)
      .single();

    const wsId = taskWs?.task_lists?.workspace_boards?.ws_id;

    let isWorkspaceMember = false;
    if (wsId) {
      const membership = await verifyWorkspaceMembershipType({
        wsId,
        userId: user.id,
        supabase: adminClient,
      });

      if (membership.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { error: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }

      isWorkspaceMember = membership.ok;
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
        .eq('task_id', shareLink.task_id);

      if (email) {
        sharesQuery = sharesQuery.or(
          `shared_with_user_id.eq.${user.id},and(shared_with_email.ilike."${email}")`
        );
      } else {
        sharesQuery = sharesQuery.eq('shared_with_user_id', user.id);
      }

      const { data: shareRow } = await sharesQuery.maybeSingle();
      const recipientPermission = shareRow?.permission ?? null;

      if (recipientPermission !== 'edit') {
        return NextResponse.json(
          { error: 'You do not have edit permission for this task' },
          { status: 403 }
        );
      }
    }

    const taskUpdateSchema = z.object({
      name: z.string().max(MAX_TASK_NAME_LENGTH).optional(),
      description: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
      priority: z
        .enum(['critical', 'high', 'normal', 'low'])
        .nullable()
        .optional(),
      start_date: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
      end_date: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
      list_id: z.guid().optional(),
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

    // Security check: If list_id is being updated, verify it belongs to the same board
    if (updates.list_id) {
      const taskBoardId = taskWs?.task_lists?.workspace_boards?.id; // taskWs is fetched above

      const { data: targetList } = await adminClient
        .from('task_lists')
        .select('board_id')
        .eq('id', updates.list_id)
        .single();

      if (!targetList || targetList.board_id !== taskBoardId) {
        return NextResponse.json(
          { error: 'Invalid list_id: Must belong to the same board' },
          { status: 400 }
        );
      }
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
