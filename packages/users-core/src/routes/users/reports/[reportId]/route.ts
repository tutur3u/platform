import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TablesUpdate } from '@tuturuuu/types';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_MONTHLY_REPORT_TEXT_LENGTH,
  MAX_MONTHLY_REPORT_TITLE_LENGTH,
} from '../../../../features/reports/report-limits';
import { getUserGroupRoutePermissions } from '../../../../lib/user-groups/route-auth';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../../lib/user-groups/route-helpers';

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
  params: Promise<{ reportId: string; wsId: string }>;
}

async function getReportAccess(request: Request, context: Params) {
  const { reportId, wsId: rawWsId } = await context.params;
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const permissions = await getUserGroupRoutePermissions(wsId, request);
  return { permissions, reportId, wsId };
}

export async function PUT(request: Request, context: Params) {
  try {
    const parsed = UpdateReportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { permissions, reportId, wsId } = await getReportAccess(
      request,
      context
    );
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!permissions.containsPermission('update_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const approvalTouched =
      parsed.data.report_approval_status !== undefined ||
      parsed.data.approved_at !== undefined ||
      parsed.data.rejected_at !== undefined ||
      parsed.data.rejection_reason !== undefined;
    if (approvalTouched && !parsed.data.report_approval_status) {
      return NextResponse.json(
        {
          message: 'Approval status is required when updating approval fields',
        },
        { status: 400 }
      );
    }
    if (approvalTouched && !permissions.containsPermission('approve_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');
    const existing = await privateDb
      .from('external_user_monthly_reports_workspace_view')
      .select('id')
      .eq('id', reportId)
      .eq('user_ws_id', wsId)
      .maybeSingle();
    if (existing.error || !existing.data) {
      return NextResponse.json(
        { message: 'Report not found' },
        { status: 404 }
      );
    }

    const updatePayload: TablesUpdate<
      { schema: 'private' },
      'external_user_monthly_reports'
    > = { ...parsed.data, updated_at: new Date().toISOString() };
    if (approvalTouched) {
      const actorAuthUid = await resolveRequestActorAuthUid(request);
      const actorLink = actorAuthUid
        ? await getWorkspaceUserLinkForUser(wsId, actorAuthUid)
        : null;
      if (!actorLink?.virtual_user_id) {
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
        Object.assign(updatePayload, {
          approved_by: actorLink.virtual_user_id,
          approved_at: parsed.data.approved_at ?? now,
          rejected_by: null,
          rejected_at: null,
          rejection_reason: null,
        });
      } else if (parsed.data.report_approval_status === 'REJECTED') {
        Object.assign(updatePayload, {
          rejected_by: actorLink.virtual_user_id,
          rejected_at: parsed.data.rejected_at ?? now,
          approved_by: null,
          approved_at: null,
        });
      } else {
        Object.assign(updatePayload, {
          approved_by: null,
          approved_at: null,
          rejected_by: null,
          rejected_at: null,
          rejection_reason: null,
        });
      }
    }

    const result = await privateDb
      .from('external_user_monthly_reports')
      .update(updatePayload)
      .eq('id', reportId);
    if (result.error) throw result.error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in report PUT:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { permissions, reportId, wsId } = await getReportAccess(
      request,
      context
    );
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!permissions.containsPermission('delete_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }
    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');
    const existing = await privateDb
      .from('external_user_monthly_reports_workspace_view')
      .select('id')
      .eq('id', reportId)
      .eq('user_ws_id', wsId)
      .maybeSingle();
    if (existing.error || !existing.data) {
      return NextResponse.json(
        { message: 'Report not found' },
        { status: 404 }
      );
    }
    const result = await privateDb
      .from('external_user_monthly_reports')
      .delete()
      .eq('id', reportId);
    if (result.error) throw result.error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in report DELETE:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
