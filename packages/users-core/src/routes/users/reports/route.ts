import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_MONTHLY_REPORT_TEXT_LENGTH,
  MAX_MONTHLY_REPORT_TITLE_LENGTH,
} from '../../../features/reports/report-limits';
import { getUserGroupRoutePermissions } from '../../../lib/user-groups/route-auth';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../lib/user-groups/route-helpers';

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
  params: Promise<{ wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const parsed = CreateReportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { wsId: rawWsId } = await params;
    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const actorAuthUid = await resolveRequestActorAuthUid(request);
    if (!actorAuthUid) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const permissions = await getUserGroupRoutePermissions(wsId, request);
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!permissions.containsPermission('create_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const actorLink = await getWorkspaceUserLinkForUser(wsId, actorAuthUid);
    if (!actorLink?.virtual_user_id) {
      return NextResponse.json(
        { message: 'User not found in workspace' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');
    const configResult = await sbAdmin
      .from('workspace_configs')
      .select('value')
      .eq('ws_id', wsId)
      .eq('id', 'ENABLE_REPORT_APPROVAL')
      .maybeSingle();
    if (configResult.error) {
      return NextResponse.json(
        { message: 'Error resolving report approval settings' },
        { status: 500 }
      );
    }

    const existing = await privateDb
      .from('external_user_monthly_reports')
      .select('id')
      .eq('user_id', parsed.data.user_id)
      .eq('group_id', parsed.data.group_id)
      .eq('title', parsed.data.title)
      .limit(1)
      .maybeSingle();
    if (existing.data) {
      return NextResponse.json(
        { message: 'Duplicate report exists' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const approvalEnabled = (configResult.data?.value ?? 'true') === 'true';
    const result = await privateDb
      .from('external_user_monthly_reports')
      .insert({
        ...parsed.data,
        creator_id: actorLink.virtual_user_id,
        updated_by: actorLink.virtual_user_id,
        created_at: now,
        updated_at: now,
        ...(approvalEnabled
          ? {}
          : {
              report_approval_status: 'APPROVED' as const,
              approved_by: actorLink.virtual_user_id,
              approved_at: now,
            }),
      })
      .select('id')
      .single();
    if (result.error) throw result.error;
    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Error in reports POST:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
