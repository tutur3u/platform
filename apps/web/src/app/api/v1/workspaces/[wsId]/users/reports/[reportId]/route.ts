import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TablesUpdate } from '@tuturuuu/types';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_MONTHLY_REPORT_TEXT_LENGTH,
  MAX_MONTHLY_REPORT_TITLE_LENGTH,
} from '@/features/reports/report-limits';

const UpdateReportSchema = z.object({
  title: z.string().max(MAX_MONTHLY_REPORT_TITLE_LENGTH).optional(),
  content: z.string().max(MAX_MONTHLY_REPORT_TEXT_LENGTH).optional(),
  feedback: z.string().max(MAX_MONTHLY_REPORT_TEXT_LENGTH).optional(),
  score: z.number().nullable().optional(),
  scores: z.array(z.number()).nullable().optional(),
  report_approval_status: z
    .enum(['PENDING', 'APPROVED', 'REJECTED'])
    .optional(),
  approved_at: z.string().nullable().optional(),
  rejected_at: z.string().nullable().optional(),
  rejection_reason: z.string().nullable().optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
    reportId: string;
  }>;
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId, reportId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId);
    const body = await request.json();
    const parsed = UpdateReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const permissions = await getPermissions({ wsId, request });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { containsPermission } = permissions;
    if (!containsPermission('update_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const approvalFieldsTouched =
      parsed.data.report_approval_status !== undefined ||
      parsed.data.approved_at !== undefined ||
      parsed.data.rejected_at !== undefined ||
      parsed.data.rejection_reason !== undefined;

    if (
      approvalFieldsTouched &&
      parsed.data.report_approval_status === undefined
    ) {
      return NextResponse.json(
        {
          message: 'Approval status is required when updating approval fields',
        },
        { status: 400 }
      );
    }

    if (approvalFieldsTouched && !containsPermission('approve_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    // Verify report belongs to workspace
    const { data: report, error: fetchError } = await sbAdmin
      .from('external_user_monthly_reports')
      .select('id, user:workspace_users!user_id!inner(ws_id)')
      .eq('id', reportId)
      .eq('user.ws_id', wsId)
      .maybeSingle();

    if (fetchError || !report) {
      return NextResponse.json(
        { message: 'Report not found' },
        { status: 404 }
      );
    }

    const updatePayload: TablesUpdate<'external_user_monthly_reports'> = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };

    if (approvalFieldsTouched) {
      const { user: authUser } =
        await resolveAuthenticatedSessionUser(supabase);

      if (!authUser) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

      const { data: workspaceUser, error: workspaceUserError } = await sbAdmin
        .from('workspace_user_linked_users')
        .select('virtual_user_id')
        .eq('platform_user_id', authUser.id)
        .eq('ws_id', wsId)
        .maybeSingle();

      if (workspaceUserError || !workspaceUser?.virtual_user_id) {
        return NextResponse.json(
          { message: 'User not found in workspace' },
          { status: 403 }
        );
      }

      if (
        parsed.data.report_approval_status === 'REJECTED' &&
        !parsed.data.rejection_reason?.trim()
      ) {
        return NextResponse.json(
          { message: 'Rejection reason is required' },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();

      if (parsed.data.report_approval_status === 'APPROVED') {
        updatePayload.approved_by = workspaceUser.virtual_user_id;
        updatePayload.approved_at = parsed.data.approved_at ?? now;
        updatePayload.rejected_by = null;
        updatePayload.rejected_at = null;
        updatePayload.rejection_reason = null;
      } else if (parsed.data.report_approval_status === 'REJECTED') {
        updatePayload.rejected_by = workspaceUser.virtual_user_id;
        updatePayload.rejected_at = parsed.data.rejected_at ?? now;
        updatePayload.approved_by = null;
        updatePayload.approved_at = null;
      } else if (parsed.data.report_approval_status === 'PENDING') {
        updatePayload.approved_by = null;
        updatePayload.approved_at = null;
        updatePayload.rejected_by = null;
        updatePayload.rejected_at = null;
        updatePayload.rejection_reason = null;
      }
    }

    const { error } = await sbAdmin
      .from('external_user_monthly_reports')
      .update(updatePayload)
      .eq('id', reportId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in report PUT:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId, reportId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId);

    const permissions = await getPermissions({ wsId, request });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { containsPermission } = permissions;
    if (!containsPermission('delete_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    // Verify report belongs to workspace
    const { data: report, error: fetchError } = await sbAdmin
      .from('external_user_monthly_reports')
      .select('id, user:workspace_users!user_id!inner(ws_id)')
      .eq('id', reportId)
      .eq('user.ws_id', wsId)
      .maybeSingle();

    if (fetchError || !report) {
      return NextResponse.json(
        { message: 'Report not found' },
        { status: 404 }
      );
    }

    const { error } = await sbAdmin
      .from('external_user_monthly_reports')
      .delete()
      .eq('id', reportId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in report DELETE:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
