import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const UpdateReportSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  feedback: z.string().optional(),
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
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      })
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
