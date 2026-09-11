import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifySecret } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserGroupRoutePermissions } from '../../../../../lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '../../../../../lib/user-groups/route-helpers';

const DeliveryActionSchema = z.object({
  action: z.enum(['preview', 'test', 'send', 'retry', 'cancel']),
});

interface Params {
  params: Promise<{ reportId: string; wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { reportId, wsId: rawWsId } = await params;
    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const permissions = await getUserGroupRoutePermissions(wsId, request);
    if (!permissions?.containsPermission('view_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }
    const admin = await createAdminClient();
    const db = admin.schema('private');
    const report = await db
      .from('external_user_monthly_reports_workspace_view')
      .select(
        'id, user_email, delivery_status, delivered_at, delivery_requested_at, last_delivery_error'
      )
      .eq('id', reportId)
      .eq('user_ws_id', wsId)
      .maybeSingle();
    if (report.error) throw report.error;
    if (!report.data)
      return NextResponse.json(
        { message: 'Report not found' },
        { status: 404 }
      );
    const queue = await db
      .from('user_report_email_queue')
      .select(
        'id, status, recipient_email, delivery_kind, attempt_count, next_attempt_at, sent_at, last_error, provider_message_id'
      )
      .eq('report_id', reportId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (queue.error) throw queue.error;
    const attempts = queue.data
      ? await db
          .from('user_report_email_attempts')
          .select(
            'id, status, attempted_at, error_message, provider_message_id'
          )
          .eq('queue_id', queue.data.id)
          .order('attempted_at', { ascending: false })
          .limit(20)
      : { data: [], error: null };
    if (attempts.error) throw attempts.error;
    return NextResponse.json(
      { report: report.data, queue: queue.data, attempts: attempts.data },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Periodic report delivery diagnostics failed', { error });
    return NextResponse.json(
      { message: 'Unable to load delivery status' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const parsed = DeliveryActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid delivery action', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { reportId, wsId: rawWsId } = await params;
    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const permissions = await getUserGroupRoutePermissions(wsId, request);
    if (!permissions?.containsPermission('send_user_group_report_emails')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');
    const reportResult = await privateDb
      .from('external_user_monthly_reports_workspace_view')
      .select(
        'id, title, content, feedback, user_id, user_email, user_ws_id, report_approval_status, delivery_status'
      )
      .eq('id', reportId)
      .eq('user_ws_id', wsId)
      .maybeSingle();
    if (reportResult.error) throw reportResult.error;
    const report = reportResult.data;
    if (!report) {
      return NextResponse.json(
        { message: 'Report not found' },
        { status: 404 }
      );
    }

    if (parsed.data.action === 'preview') {
      return NextResponse.json({
        message: 'Preview ready. No email was queued.',
        preview: {
          content: report.content,
          feedback: report.feedback,
          recipient: report.user_email,
          title: report.title,
        },
        queued: false,
        status: report.delivery_status,
      });
    }

    if (
      report.delivery_status === 'processing' ||
      (report.delivery_status === 'queued' &&
        parsed.data.action !== 'cancel') ||
      report.delivery_status === 'sent'
    ) {
      return NextResponse.json(
        { message: 'This report is already queued, processing, or sent.' },
        { status: 409 }
      );
    }
    if (
      parsed.data.action !== 'cancel' &&
      report.report_approval_status !== 'APPROVED'
    ) {
      return NextResponse.json(
        { message: 'Approve this report before sending it.' },
        { status: 409 }
      );
    }
    let deliveryEnabled = false;
    if (parsed.data.action !== 'cancel') {
      const [globalGateEnabled, periodicGateEnabled] = await Promise.all([
        verifySecret({
          forceAdmin: true,
          name: 'ENABLE_EMAIL_SENDING',
          value: 'true',
          wsId,
        }),
        verifySecret({
          forceAdmin: true,
          name: 'ENABLE_REPORT_EMAIL_SENDING',
          value: 'true',
          wsId,
        }),
      ]);
      deliveryEnabled = globalGateEnabled && periodicGateEnabled;
    }
    const { data, error } = await privateDb.rpc(
      'request_periodic_report_delivery',
      {
        p_report_id: reportId,
        p_ws_id: wsId,
        p_action: parsed.data.action,
        p_delivery_enabled: deliveryEnabled,
      }
    );
    if (error) throw error;
    const result = data as {
      code: number;
      message: string;
      queued?: boolean;
      status?: string;
    };
    const { code, ...body } = result;
    return NextResponse.json(
      { ...body, ...(code !== 200 ? { queued: false } : {}) },
      { status: code }
    );
  } catch (error) {
    console.error('Error in periodic report delivery POST:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
