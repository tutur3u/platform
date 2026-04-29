import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  getWorkspaceUser,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_MONTHLY_REPORT_TEXT_LENGTH,
  MAX_MONTHLY_REPORT_TITLE_LENGTH,
} from '@/features/reports/report-limits';

const CreateReportSchema = z.object({
  user_id: z.guid(),
  group_id: z.guid(),
  title: z.string().min(1).max(MAX_MONTHLY_REPORT_TITLE_LENGTH),
  content: z.string().max(MAX_MONTHLY_REPORT_TEXT_LENGTH),
  feedback: z.string().max(MAX_MONTHLY_REPORT_TEXT_LENGTH),
  score: z.number().nullable().optional(),
  scores: z.array(z.number()).nullable().optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const body = await request.json();
    const parsed = CreateReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { wsId: rawWsId } = await params;
    const supabase = await createClient(request);
    const { user: authUser } = await resolveAuthenticatedSessionUser(supabase);
    if (!authUser) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const permissions = await getPermissions({ wsId, request });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { containsPermission } = permissions;
    if (!containsPermission('create_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    const workspaceUser = await getWorkspaceUser(wsId, authUser.id);

    if (!workspaceUser?.virtual_user_id) {
      return NextResponse.json(
        { message: 'User not found in workspace' },
        { status: 403 }
      );
    }

    const { data: reportApprovalConfig, error: reportApprovalConfigError } =
      await sbAdmin
        .from('workspace_configs')
        .select('value')
        .eq('ws_id', wsId)
        .eq('id', 'ENABLE_REPORT_APPROVAL')
        .maybeSingle();

    if (reportApprovalConfigError) {
      return NextResponse.json(
        { message: 'Error resolving report approval settings' },
        { status: 500 }
      );
    }

    const enableReportApproval =
      (reportApprovalConfig?.value ?? 'true') === 'true';

    // Check for duplicate report
    const { data: existing } = await sbAdmin
      .from('external_user_monthly_reports')
      .select('id')
      .eq('user_id', parsed.data.user_id)
      .eq('group_id', parsed.data.group_id)
      .eq('title', parsed.data.title)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { message: 'Duplicate report exists' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await sbAdmin
      .from('external_user_monthly_reports')
      .insert({
        user_id: parsed.data.user_id,
        group_id: parsed.data.group_id,
        title: parsed.data.title,
        content: parsed.data.content,
        feedback: parsed.data.feedback,
        score: parsed.data.score,
        scores: parsed.data.scores,
        creator_id: workspaceUser.virtual_user_id,
        updated_by: workspaceUser.virtual_user_id,
        created_at: now,
        updated_at: now,
        ...(enableReportApproval
          ? {}
          : {
              report_approval_status: 'APPROVED',
              approved_by: workspaceUser.virtual_user_id,
              approved_at: now,
              rejected_by: null,
              rejected_at: null,
              rejection_reason: null,
            }),
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in reports POST:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
